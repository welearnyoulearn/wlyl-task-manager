-- ============================================================
-- Fixup for 011_weekly_activity_items.sql
-- Run this in the Supabase SQL editor. Safe to run even if parts of
-- this already happened - every statement is idempotent.
--
-- Two things 011 missed/hit on first run:
-- 1. `text` (the original free-text bullet column from
--    001_auth_and_ticket_items.sql) was never dropped - it's still
--    `not null` with no default, which would break every future
--    insert into weekly_update_items (the app never writes it).
-- 2. `add constraint weekly_update_items_unique_ticket` has no
--    "if not exists" form in Postgres, so re-running 011 after a
--    partial success fails with "already exists" even though the
--    constraint itself is correct and in place. This file guards it
--    with a DO block instead.
-- ============================================================

alter table weekly_update_items
  drop column if exists text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'weekly_update_items_unique_ticket'
  ) then
    alter table weekly_update_items
      add constraint weekly_update_items_unique_ticket unique (weekly_update_id, ticket_id);
  end if;
end $$;
