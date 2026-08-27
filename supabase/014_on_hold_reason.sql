-- ============================================================
-- Migration: rename "Blocked" status to "On Hold" + mandatory reason
-- Run this in the Supabase SQL editor after 001-013.
--
-- "Blocked" is renamed to "On Hold" everywhere, including existing
-- data: tasks.status has no check constraint restricting its values
-- (confirmed - only qa_status does), so this is a plain data rename,
-- not a schema change to the column itself. Going forward, selecting
-- On Hold in the status dropdown requires a reason (tasks.hold_reason,
-- new nullable column - null on every existing row, since no reason
-- was ever captured for tickets already sitting at Blocked before this
-- migration).
-- ============================================================

-- ============================================================
-- PART 1 — schema
-- ============================================================

alter table tasks
  add column if not exists hold_reason text;

-- ============================================================
-- PART 2 — data: rename existing Blocked rows to On Hold.
-- ============================================================

update tasks set status = 'On Hold' where status = 'Blocked';

-- ============================================================
-- PART 3 — trigger: extend enforce_tasks_column_role_gate
-- (010_qa_assignee.sql PART 3, most recently updated in
-- 013_mandatory_qa_assignment.sql) so a status write to 'On Hold'
-- requires hold_reason to be set in the same request, same pattern as
-- 012_test_plan.sql's mandatory test_plan check on Mark Ready for QA.
-- Re-creating the whole function since Postgres has no "alter function
-- body" statement - this is the same function, with one condition added
-- to the existing dev-fields branch.
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
    -- NEW: moving status to On Hold requires a reason in the same
    -- request - the UI (TaskCard.jsx) always sends both fields
    -- together in one update when On Hold is selected, so this can
    -- never be satisfied by a stale hold_reason left over from a
    -- previous On Hold period that wasn't actually re-provided this time.
    if new.status = 'On Hold' and (new.hold_reason is null or btrim(new.hold_reason) = '') then
      raise exception 'A reason is required to mark a ticket On Hold';
    end if;
  end if;

  -- QA-only fields: qa_status and qa_assignee. qa_assignee is
  -- admin-only to write, period.
  if new.qa_assignee is distinct from old.qa_assignee then
    raise exception 'Only an admin can set qa_assignee';
  end if;

  if new.qa_status is distinct from old.qa_status then
    if new.qa_status = 'Ready for QA' and old.qa_status in ('Not Ready', 'Failed') then
      -- "Mark Ready for QA" is a DEV action, gated to the assignee with
      -- a developer/both role, and requires a test plan in the same
      -- request (012_test_plan.sql).
      if not (
        old.assignee = (select username from profiles where id = auth.uid())
        and caller_role in ('developer', 'both')
      ) then
        raise exception 'Only the assignee (with developer or both member_role) can mark a ticket Ready for QA';
      end if;
      if new.test_plan is null or btrim(new.test_plan) = '' then
        raise exception 'A test plan is required to mark a ticket Ready for QA';
      end if;
    elsif new.qa_status = 'In QA' and old.qa_status = 'Ready for QA' then
      -- Start QA requires qa_assignee to be set AND the caller to be
      -- that specific person - self-pick by "any qualified tester" is
      -- not allowed (013_mandatory_qa_assignment.sql).
      if old.qa_assignee is null then
        raise exception 'This ticket has not been assigned to a tester yet - an admin must use Assign QA first';
      end if;
      if old.qa_assignee <> auth.uid() then
        raise exception 'Only the assigned tester can start QA on this ticket';
      end if;
    elsif caller_role not in ('tester', 'both') then
      raise exception 'Only a tester (or both) member_role can change qa_status';
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- Trigger itself is unchanged (same name, same function reference).
