-- ============================================================
-- Migration: make QA assignment mandatory (remove tester self-pick)
-- Run this in the Supabase SQL editor after 001-012.
--
-- Previously (010_qa_assignee.sql): qa_assignee was optional - if an
-- admin left it unset, any qualified tester could self-pick a
-- Ready-for-QA ticket via Start QA. This removes that fallback: Start
-- QA is now only actionable once an admin has explicitly assigned a
-- specific tester via qa_assignee. Existing tickets already sitting at
-- Ready for QA with qa_assignee still null are simply stuck until an
-- admin assigns someone - no data change needed, this is a pure
-- behavior tightening.
-- ============================================================

-- ============================================================
-- PART 1 — RLS: tasks_update_qa no longer allows a null qa_assignee
-- to satisfy "any qualified tester" for the Start-QA transition.
-- ============================================================

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
            and tasks.qa_assignee = auth.uid()
          )
        )
    )
  );

-- ============================================================
-- PART 2 — trigger: enforce the same rule at the column-gate level,
-- specifically for the Ready-for-QA -> In-QA transition (Start QA).
-- Pass QA / Fail QA on an already-In-QA ticket stay gated to the
-- qa_assignee via the RLS policy above (qa_assignee is set by
-- definition once a ticket reaches In QA under this new rule).
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

  -- QA-only fields: qa_status and qa_assignee. qa_assignee is
  -- admin-only to write, period (unchanged from 010).
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
      -- NEW: Start QA now requires qa_assignee to be set AND the caller
      -- to be that specific person - self-pick by "any qualified
      -- tester" is no longer allowed. tasks_update_qa's RLS policy
      -- already narrows this at the row level, but the trigger closes
      -- the same column-scoping gap noted throughout this file's
      -- history (RLS can't tell "this write only touches qa_status"
      -- from any other qa_assignee-satisfying write).
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
