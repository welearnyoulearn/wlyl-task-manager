-- ============================================================
-- Migration: tasks.updated_at, auto-maintained by trigger
-- Run this in the Supabase SQL editor after 001-008.
--
-- Additive only, no RLS changes needed: updated_at is set by a
-- database trigger, not by application code, so no new write path
-- exists for the client to need a policy for. Existing UPDATE
-- policies on tasks (006/008) already govern whether an UPDATE is
-- allowed at all; the trigger just runs as part of any UPDATE that
-- policy already permitted.
-- ============================================================

alter table tasks
  add column if not exists updated_at timestamptz not null default now();

-- Backfill existing rows so "Last Updated" has a real value immediately
-- instead of every existing ticket showing the same now() the moment
-- this migration ran. created_at is the best available proxy for rows
-- that have never been updated since; there's no way to recover the
-- actual last-modified time for older rows since nothing tracked it
-- before this migration.
update tasks set updated_at = created_at where updated_at is null;

create or replace function set_tasks_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tasks_set_updated_at on tasks;
create trigger tasks_set_updated_at
  before update on tasks
  for each row
  execute function set_tasks_updated_at();
