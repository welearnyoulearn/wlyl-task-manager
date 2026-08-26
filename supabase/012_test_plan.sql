-- ============================================================
-- Migration: mandatory test plan on Mark Ready for QA
-- Run this in the Supabase SQL editor after 001-011.
--
-- Additive only, nullable column: tasks.test_plan is null on every
-- existing ticket. Going forward, the trigger below requires it to be
-- set in the SAME request that moves qa_status Not Ready/Failed ->
-- Ready for QA (the same transition TaskCard.jsx's "Mark Ready for QA"
-- already gates to the assignee/developer role) - enforced at the
-- database level, not just by the UI requiring the field before
-- enabling its submit button.
-- ============================================================

-- ============================================================
-- PART 1 — schema
-- ============================================================

alter table tasks
  add column if not exists test_plan text;

-- ============================================================
-- PART 2 — trigger: extend enforce_tasks_column_role_gate
-- (010_qa_assignee.sql PART 3) with a not-null-at-transition-time
-- check for test_plan, in the same branch that already gates the
-- Ready-for-QA transition to the assignee/developer role. Re-creating
-- the whole function since Postgres has no "alter function body"
-- statement - this is the same function, with one condition added.
-- ============================================================

create or replace function enforce_tasks_column_role_gate()
returns trigger as $$
declare
  caller_is_admin boolean;
  caller_role text;
begin
  select is_admin, member_role into caller_is_admin, caller_role
  from profiles where id = auth.uid();

  if coalesce(caller_is_admin, false) then
    return new;
  end if;

  -- Dev-only fields: status (except the Pass-QA force-advance-to-Done
  -- case) and accepted_at. Caller must be the assignee with a
  -- qualifying dev role.
  if (
    new.accepted_at is distinct from old.accepted_at
    or (
      new.status is distinct from old.status
      and not (new.status = 'Done' and new.qa_status = 'Passed' and old.qa_status is distinct from 'Passed')
    )
  ) then
    if not (
      old.assignee = (select username from profiles where id = auth.uid())
      and caller_role in ('developer', 'both')
    ) then
      raise exception 'Only the assignee (with developer or both member_role) can change task status/accepted_at';
    end if;
  end if;

  -- QA-only fields: qa_status and qa_assignee. Caller must have a
  -- qualifying tester role (qa_assignee routing is already checked by
  -- the tasks_update_qa RLS policy itself, since it references
  -- tasks.qa_assignee in its USING clause). qa_assignee is additionally
  -- restricted to admin-only here, since "Assign QA" is an admin action
  -- in the UI (TaskCard.jsx) even though any qualifying tester could
  -- otherwise satisfy tasks_update_qa's row-level check.
  if new.qa_assignee is distinct from old.qa_assignee then
    raise exception 'Only an admin can set qa_assignee';
  end if;

  if new.qa_status is distinct from old.qa_status then
    -- "Mark Ready for QA" (Not Ready/Failed -> Ready for QA) is a DEV
    -- action per README/TaskCard.jsx's canMarkReadyForQa - it's gated
    -- to the assignee with a developer/both role there, not a tester,
    -- even though it writes qa_status. Every other qa_status transition
    -- (Start QA, Pass QA, Fail QA) is tester-gated.
    if new.qa_status = 'Ready for QA' and old.qa_status in ('Not Ready', 'Failed') then
      if not (
        old.assignee = (select username from profiles where id = auth.uid())
        and caller_role in ('developer', 'both')
      ) then
        raise exception 'Only the assignee (with developer or both member_role) can mark a ticket Ready for QA';
      end if;
      -- NEW: a test plan is mandatory in this same request - the UI
      -- (TaskCard.jsx's markReadyForQa) always sends both fields
      -- together in one update, so this check can never be satisfied
      -- by a stale test_plan value left over from a previous cycle
      -- that wasn't actually re-provided this time.
      if new.test_plan is null or btrim(new.test_plan) = '' then
        raise exception 'A test plan is required to mark a ticket Ready for QA';
      end if;
    elsif caller_role not in ('tester', 'both') then
      raise exception 'Only a tester (or both) member_role can change qa_status';
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- Trigger itself is unchanged (same name, same function reference) -
-- no need to drop/recreate it, only the function body changed above.
