-- ============================================================
-- Migration: member sub-roles (Developer / Tester / Both)
-- Run this in the Supabase SQL editor after 001-007.
--
-- Additive only: does not touch tasks.status, tasks.qa_status, or any
-- existing column/value.
-- ============================================================

-- ============================================================
-- PART 1 — schema
-- ============================================================

-- member_role is nullable (not "not null default 'both'") so it can be
-- explicitly null for admins, who already get every dev/QA action via
-- is_admin regardless of this column — see README/NOTES for the
-- reasoning. Every EXISTING row (member or admin) defaults to 'both' on
-- this ALTER, matching the instruction that nothing should break for
-- current users until an admin explicitly sets narrower roles; admins
-- can be nulled out afterward if desired (not done automatically here,
-- since that's a data decision, not a schema one).
alter table profiles
  add column if not exists member_role text default 'both'
  check (member_role is null or member_role in ('developer', 'tester', 'both'));

-- ============================================================
-- PART 2 — RLS: enforce role gating at the database level, not just
-- in the UI. Plan confirmed with the user before writing this.
-- ============================================================

-- profiles: admins can update member_role on any profile. This is a
-- narrow, additive policy — profiles previously had zero UPDATE
-- policies (every other profile write goes through the manage-user
-- Edge Function's service-role path, which bypasses RLS entirely and
-- is unaffected by this).
--
-- CAVEAT, same shape as the tasks column-scoping gap from
-- 006_rls_hardening.sql: Postgres RLS can't restrict which columns an
-- UPDATE touches, only whether the whole row-level UPDATE is allowed.
-- This policy's WITH CHECK only verifies the CALLER is an admin — it
-- doesn't independently re-verify per-column afterward, so a direct
-- API call from an admin session could technically also change
-- is_admin/username on the same request. The app's UI only ever sends
-- {member_role: value} (see MemberRoleCell.jsx), so this isn't
-- exploitable through the app. Flagged, not hidden - and the practical
-- risk is bounded by the fact that the caller must already be a
-- verified admin, who has other ways to make the same changes (e.g.
-- promote/remove via the Edge Function) anyway.
drop policy if exists "profiles_update_member_role" on profiles;
create policy "profiles_update_member_role" on profiles
  for update
  using (
    exists (select 1 from profiles admin_check where admin_check.id = auth.uid() and admin_check.is_admin)
  );

-- tasks: tighten the two UPDATE policies from 006_rls_hardening.sql so
-- role gating is enforced at the DB layer, not just by hiding buttons.

drop policy if exists "tasks_update_dev_fields" on tasks;
create policy "tasks_update_dev_fields" on tasks
  for update
  using (
    (
      assignee = (select username from profiles where id = auth.uid())
      and exists (
        select 1 from profiles
        where id = auth.uid() and member_role in ('developer', 'both')
      )
    )
    or exists (select 1 from profiles where id = auth.uid() and is_admin)
  );

drop policy if exists "tasks_update_qa" on tasks;
create policy "tasks_update_qa" on tasks
  for update
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and (is_admin or member_role in ('tester', 'both'))
    )
  );
