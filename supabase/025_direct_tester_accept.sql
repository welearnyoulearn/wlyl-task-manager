-- ============================================================
-- Migration: allow a pure-tester assignee to Accept a ticket assigned
-- directly to them (QA-only tickets, no dev phase).
-- Run this in the Supabase SQL editor after 001-024.
--
-- Until now, a ticket assigned straight to a tester-role member (not
-- developer/both) got stuck permanently at status 'Assigned': the
-- Accept Task button requires member_role developer/both client-side,
-- and even if that check were removed, this same trigger rejected the
-- accepted_at/status write server-side with "Only the assignee (with
-- developer or both member_role) can change task status/accepted_at".
-- TaskCard.jsx already has isDirectTesterAssignee/canResolveQaDirect
-- wired up for Pass/Fail QA on this ticket shape, but the ticket could
-- never reach that state because Accept Task itself was never carved
-- out - this migration is that missing piece, plus the matching UI
-- change in the same commit.
--
-- Deliberately narrow: only accepting (status -> 'Not Started',
-- accepted_at set) is allowed for a tester-role assignee - every other
-- dev-status transition (In Progress, On Hold, Done, Mark Ready for
-- QA) still requires developer/both, unchanged. A tester accepting
-- their own direct ticket does not need to touch qa_assignee/qa_status
-- either; Pass/Fail QA reach qa_status via the existing
-- canResolveQaDirect path in the app, which is a caller_role-only
-- check further down this same function, already correct as-is.
--
-- IMPORTANT, found via live testing before shipping this: the trigger
-- change alone is not enough. tasks_update_dev_fields (008_member_roles.sql)
-- requires member_role in ('developer','both') in its own RLS USING
-- clause, and tasks_update_qa (013_mandatory_qa_assignment.sql)
-- requires tasks.qa_assignee = auth.uid(), which is null on a fresh
-- direct-assignment ticket - so a tester's accept write was being
-- silently filtered out by RLS (0 rows affected, no error, no
-- exception - the PostgREST signature for "the row didn't pass USING")
-- before the trigger ever got a chance to run. PART 2 below updates
-- tasks_update_dev_fields to admit this one case at the RLS layer too.
-- ============================================================

-- PART 2 - RLS: let a tester-role assignee's row through
-- tasks_update_dev_fields so the trigger in PART 1 actually gets
-- invoked for their accept write. The trigger still does the real
-- column-shape enforcement (this transition only) - RLS only needs to
-- stop excluding the row outright.
drop policy if exists "tasks_update_dev_fields" on tasks;
create policy "tasks_update_dev_fields" on tasks
  for update
  using (
    (
      assignee = (select username from profiles where id = auth.uid())
      and exists (
        select 1 from profiles
        where id = auth.uid() and member_role in ('developer', 'both', 'tester')
      )
    )
    or exists (select 1 from profiles where id = auth.uid() and is_admin)
  );

create or replace function enforce_tasks_column_role_gate()
returns trigger as $$
declare
  caller_is_admin boolean;
  caller_role text;
begin
  select is_admin, member_role into caller_is_admin, caller_role
  from profiles where id = auth.uid();

  if new.status = 'Closed' and old.status is distinct from 'Closed' then
    if not coalesce(caller_is_admin, false) then
      raise exception 'Only an admin can close a ticket';
    end if;
    if old.qa_status is distinct from 'Passed' then
      raise exception 'Only a ticket that has passed QA can be closed';
    end if;
    return new;
  end if;

  if old.status = 'Closed' then
    raise exception 'This ticket is closed and can no longer be modified';
  end if;

  if coalesce(caller_is_admin, false) then
    return new;
  end if;

  if (
    new.accepted_at is distinct from old.accepted_at
    or (
      new.status is distinct from old.status
      and not (new.status = 'Done' and new.qa_status = 'Passed' and old.qa_status is distinct from 'Passed')
    )
  ) then
    if not (
      old.assignee = (select username from profiles where id = auth.uid())
      and (
        caller_role in ('developer', 'both')
        -- Direct-to-tester acceptance: a tester-role assignee accepting
        -- their own not-yet-accepted ticket, and only that one
        -- transition (Assigned -> Not Started via accepted_at). Every
        -- other status change still requires developer/both, checked
        -- by the branch above.
        or (
          caller_role = 'tester'
          and old.status = 'Assigned'
          and new.status = 'Not Started'
          and old.accepted_at is null
          and new.accepted_at is not null
        )
      )
    ) then
      raise exception 'Only the assignee (with developer or both member_role) can change task status/accepted_at';
    end if;
    if new.status = 'On Hold' and (new.hold_reason is null or btrim(new.hold_reason) = '') then
      raise exception 'A reason is required to mark a ticket On Hold';
    end if;
  end if;

  if new.qa_assignee is distinct from old.qa_assignee then
    raise exception 'Only an admin can set qa_assignee';
  end if;

  if new.qa_status is distinct from old.qa_status then
    if new.qa_status = 'Ready for QA' and old.qa_status in ('Not Ready', 'Failed') then
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
