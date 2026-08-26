-- ============================================================
-- Migration: repurpose weekly_update_items for auto-detected
-- per-ticket weekly activity notes (Phase 5 Part A).
-- Run this in the Supabase SQL editor after 001-010.
--
-- weekly_update_items has existed since 001_auth_and_ticket_items.sql
-- but was never used by any app code (see NOTES.md #5) - its RLS is
-- still the original permissive "for all using (true)" policy. This
-- migration repurposes it: instead of "one row per free-text bullet,
-- optionally tagged with a ticket", it becomes "one row per
-- (weekly_update, ticket) the member touched that week, with an
-- optional short note". `section` and `position` (bullet-list
-- concerns) are dropped since the new Submit Update UI has no
-- free-text bullets to position - only one row per ticket per report.
--
-- Old rows: none exist (confirmed - the column was never written by
-- any shipped code), so this is a clean repurpose, not a backfill.
-- ============================================================

-- ============================================================
-- PART 1 — schema
-- ============================================================

alter table weekly_update_items
  drop column if exists section,
  drop column if exists position;

alter table weekly_update_items
  alter column ticket_id set not null,
  add column if not exists note text not null default '';

alter table weekly_update_items
  add constraint weekly_update_items_unique_ticket unique (weekly_update_id, ticket_id);

-- ============================================================
-- PART 2 — RLS: real policies, replacing the original
-- "for all using(true)" permissive-during-migration policy.
-- Same ownership pattern as weekly_updates itself
-- (006_rls_hardening.sql): an item's owner is whoever owns its
-- parent weekly_update row.
-- ============================================================

drop policy if exists "weekly_update_items_all" on weekly_update_items;

create policy "weekly_update_items_select" on weekly_update_items
  for select using (true); -- team-wide visibility, matches weekly_updates_select

create policy "weekly_update_items_insert" on weekly_update_items
  for insert with check (
    exists (
      select 1 from weekly_updates wu
      where wu.id = weekly_update_id and wu.user_id = auth.uid()
    )
  );

create policy "weekly_update_items_update" on weekly_update_items
  for update using (
    exists (
      select 1 from weekly_updates wu
      where wu.id = weekly_update_id and wu.user_id = auth.uid()
    )
  );

create policy "weekly_update_items_delete" on weekly_update_items
  for delete using (
    exists (
      select 1 from weekly_updates wu
      where wu.id = weekly_update_id and wu.user_id = auth.uid()
    )
  );
