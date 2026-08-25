-- ============================================================
-- Migration: admin-driven QA assignment (tasks.qa_assignee)
-- Run this in the Supabase SQL editor after 001-009.
--
-- Additive only, nullable column: when qa_assignee is null (the
-- default, and the state of every existing ticket), behavior is
-- unchanged from before this migration — any qualified tester can
-- self-pick a ticket via Start QA. Setting qa_assignee routes that
-- ticket to a specific person instead.
-- ============================================================

-- ============================================================
-- PART 1 — schema
-- ============================================================

alter table tasks
  add column if not exists qa_assignee uuid references profiles(id);

-- ============================================================
-- PART 2 — RLS: tighten tasks_update_qa (from 008_member_roles.sql)
-- so a set qa_assignee actually routes Start QA at the database level,
-- not just in the UI. Plan confirmed with the user before writing this.
-- ============================================================

-- Was (008_member_roles.sql):
--   using (
--     exists (
--       select 1 from profiles
--       where id = auth.uid()
--         and (is_admin or member_role in ('tester', 'both'))
--     )
--   )
--
-- New: same role check, plus - when qa_assignee is set on the row - the
-- caller must be that specific person (or an admin). qa_assignee is
-- null on every ticket by default, so this is a no-op behavior change
-- until an admin actually assigns someone.
--
-- CAVEAT (as originally written here, before PART 3 existed): this same
-- policy also governs writes to qa_assignee itself (RLS can't
-- distinguish which column an UPDATE touches, same limitation noted in
-- 006/008) - so a qualified tester could technically set qa_assignee
-- via a direct API call even though "Assign QA" is admin-only in the
-- UI. This is NO LONGER an open gap: PART 3's trigger below adds an
-- explicit admin-only check on qa_assignee writes, closing it for real
-- rather than leaving it accepted-but-open. Kept here for the RLS-layer
-- history/reasoning, not as a live caveat.
drop policy if exists "tasks_update_qa" on tasks;
create policy "tasks_update_qa" on tasks
  for update
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and (
          is_admin
          or (
            member_role in ('tester', 'both')
            and (tasks.qa_assignee is null or tasks.qa_assignee = auth.uid())
          )
        )
    )
  );

-- ============================================================
-- PART 3 — trigger: real column-level enforcement.
--
-- Superseded, corrects the flagged gap: tasks_update_dev_fields and
-- tasks_update_qa are separate PERMISSIVE policies, which Postgres ORs
-- together — so a write that only touches status/accepted_at still
-- passes RLS as long as it satisfies tasks_update_qa's role check
-- (any tester/both), even though tasks_update_dev_fields alone would
-- have rejected it. Confirmed this is a real gap, not theoretical: a
-- tester-role assignee's direct-API status/accepted_at write went
-- through in testing, and a developer-role assignee's qa_status write
-- did too, via the same mechanism in reverse. RLS's USING clause can't
-- see which columns an UPDATE actually touches, only whether the row
-- is allowed at all — a BEFORE UPDATE trigger inspecting OLD vs NEW
-- can, so that's what closes this for real rather than leaving it
-- documented-but-open.
--
-- One legitimate cross-boundary case this trigger has to allow: Pass QA
-- (TaskCard.jsx's passQa) is a tester-only action that also sets
-- status='Done' in the same request when the ticket isn't already Done
-- (README: "also force-advances dev status to Done"). The trigger
-- treats status moving specifically to 'Done' while qa_status is
-- simultaneously moving to 'Passed' as part of the QA action, not the
-- dev action, so a qualifying tester passing QA doesn't get blocked by
-- the dev-field check below.
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
    -- (Start QA, Pass QA, Fail QA) is tester-gated. Missed this
    -- distinction on the first pass at this trigger - caught by
    -- member-roles.spec.js's developer-role test actually exercising
    -- Mark Ready for QA as a legitimate action and failing when the
    -- trigger wrongly required a tester role for it.
    if new.qa_status = 'Ready for QA' and old.qa_status in ('Not Ready', 'Failed') then
      if not (
        old.assignee = (select username from profiles where id = auth.uid())
        and caller_role in ('developer', 'both')
      ) then
        raise exception 'Only the assignee (with developer or both member_role) can mark a ticket Ready for QA';
      end if;
    elsif caller_role not in ('tester', 'both') then
      raise exception 'Only a tester (or both) member_role can change qa_status';
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists tasks_enforce_column_role_gate on tasks;
create trigger tasks_enforce_column_role_gate
  before update on tasks
  for each row
  execute function enforce_tasks_column_role_gate();
