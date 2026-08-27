-- ============================================================
-- Migration: Closed status for tickets that have passed QA and been
-- deployed by an admin.
-- Run this in the Supabase SQL editor after 001-015.
--
-- "Closed" is a new, final value for tasks.status - distinct from
-- "Done" (which just means dev work finished; a Done ticket can still
-- fail QA and cycle back). tasks.status has no check constraint (see
-- 014's note), so adding this value is a plain data-model extension,
-- no schema change needed for the column itself.
-- ============================================================

-- PART 1 - who/when closed it, for the record.
alter table tasks
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by text;

-- PART 2 - trigger: only an admin may close a ticket, and only one
-- that has actually passed QA - mirrors the existing mandatory-reason
-- pattern (012 test_plan, 014 hold_reason) by extending the same
-- enforce_tasks_column_role_gate function rather than adding a
-- separate trigger.
create or replace function enforce_tasks_column_role_gate()
returns trigger as $
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
      and caller_role in ('developer', 'both')
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
$ language plpgsql security definer;
