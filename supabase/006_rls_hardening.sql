-- ============================================================
-- Migration: RLS hardening — replace using(true) with real
-- role/ownership-based policies.
-- Run this in the Supabase SQL editor after 001-005.
--
-- Every "drop policy" below removes a permissive using(true)/for-all
-- policy that has been in place since 001_auth_and_ticket_items.sql /
-- 004_qa_workflow.sql. Each drop is immediately followed by the real
-- policies replacing it, so there should be no window where a table has
-- RLS enabled with zero applicable policies (which would silently deny
-- everything, including reads).
--
-- IMPORTANT: run this on a TEST/STAGING Supabase project first, not
-- production. A too-strict policy here shows up as legitimate actions
-- silently failing, not as an obvious error — that only shows up by
-- actually running the app (and the Playwright suite) against it.
-- ============================================================

-- ============================================================
-- 0. Backfill weekly_updates.user_id before enforcing ownership on it.
--    This column has existed since 001_auth_and_ticket_items.sql but
--    the app has never written it — every existing row has it null.
--    Same orphan-check discipline as 005_fk_fixes.sql: report the
--    orphan-check SELECT's results before trusting the owner-only
--    policy below to behave correctly for existing reports.
-- ============================================================

update weekly_updates wu
set user_id = p.id
from profiles p
where lower(p.username) = lower(wu.name)
  and wu.user_id is null;

-- Orphan check — report this before proceeding. Any row still null
-- here means that person's existing weekly report cannot be edited
-- (resubmitted) once the owner-only UPDATE policy below goes live,
-- because RLS's USING clause checks the row's CURRENT user_id, not
-- what it's being changed to.
select id, name, week_of, submitted_at
from weekly_updates
where user_id is null;

-- ============================================================
-- 1. profiles
-- ============================================================

-- Was: profiles_select_all — for select using (true). Kept as-is,
-- read access is still team-wide (needed for login, assignee lists,
-- "By Person", etc.) — no change to the select policy itself.

-- New: allow a client-side self-insert ONLY for the bootstrap case
-- (creating the very first admin, before any admin profile exists —
-- see AuthContext.jsx's createFirstAdmin). Every other profile write
-- (create member, create additional admin, promote, remove,
-- set-password) goes through the manage-user Edge Function, which
-- runs with the service role key and bypasses RLS entirely — no
-- policy is needed or possible to restrict that path further here.
drop policy if exists "profiles_bootstrap_insert" on profiles;
create policy "profiles_bootstrap_insert" on profiles
  for insert
  with check (
    id = auth.uid()
    and is_admin = true
    and not exists (select 1 from profiles where is_admin)
  );

-- No update/delete policy for profiles: neither is possible from the
-- client under RLS (both admin actions go through the Edge Function).

-- ============================================================
-- 2. tasks
-- ============================================================

drop policy if exists "tasks_all" on tasks;

create policy "tasks_select" on tasks
  for select using (true); -- team-wide visibility, unchanged

create policy "tasks_insert_admin" on tasks
  for insert
  with check (
    exists (select 1 from profiles where id = auth.uid() and is_admin)
  );

create policy "tasks_delete_admin" on tasks
  for delete
  using (
    exists (select 1 from profiles where id = auth.uid() and is_admin)
  );

-- Two UPDATE policies, matching the two different actors the app
-- actually allows to change different fields (see README "QA workflow"
-- section): dev-status changes are assignee-or-admin; qa_status
-- changes are any authenticated member, by design (QA is done by
-- whichever tester picks it up, not the ticket's dev assignee).
--
-- CAVEAT, confirmed with the user before writing this: Postgres RLS
-- cannot restrict which specific COLUMNS an UPDATE touches — it can
-- only allow or deny the whole row-level UPDATE. Multiple permissive
-- policies are OR'd together, so in practice this means: any
-- authenticated user can issue an UPDATE to a task row (satisfying
-- tasks_update_qa below), and nothing at the RLS layer stops that same
-- request from also including a `status` field change in its payload.
-- The UI never does this (TaskCard's dev-status dropdown and QA
-- buttons are separate actions with separate payloads), so this is a
-- gap only exploitable via a direct API call, not through the app —
-- flagged, not hidden, same as the original plan.
create policy "tasks_update_dev_fields" on tasks
  for update
  using (
    assignee = (select username from profiles where id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and is_admin)
  );

create policy "tasks_update_qa" on tasks
  for update
  using (auth.uid() is not null);

-- ============================================================
-- 3. task_comments
-- ============================================================

drop policy if exists "task_comments_all" on task_comments;

create policy "task_comments_select" on task_comments
  for select using (true);

create policy "task_comments_insert" on task_comments
  for insert
  with check (
    author = (select username from profiles where id = auth.uid())
  );

-- No update/delete policy: no edit/delete UI exists for task comments.

-- ============================================================
-- 4. weekly_update_comments
-- ============================================================

drop policy if exists "weekly_update_comments_all" on weekly_update_comments;

create policy "weekly_update_comments_select" on weekly_update_comments
  for select using (true);

create policy "weekly_update_comments_insert" on weekly_update_comments
  for insert
  with check (
    author = (select username from profiles where id = auth.uid())
  );

-- No update/delete policy: no edit/delete UI exists for report comments.

-- ============================================================
-- 5. weekly_updates
-- ============================================================

drop policy if exists "weekly_updates_all" on weekly_updates;

create policy "weekly_updates_select" on weekly_updates
  for select using (true); -- team-wide visibility, unchanged

create policy "weekly_updates_insert" on weekly_updates
  for insert
  with check (user_id = auth.uid());

create policy "weekly_updates_update" on weekly_updates
  for update
  using (user_id = auth.uid());

create policy "weekly_updates_delete_admin" on weekly_updates
  for delete
  using (
    exists (select 1 from profiles where id = auth.uid() and is_admin)
  );

-- ============================================================
-- 6. bug_reports
-- ============================================================

drop policy if exists "bug_reports_all" on bug_reports;

create policy "bug_reports_select" on bug_reports
  for select using (true);

create policy "bug_reports_insert" on bug_reports
  for insert
  with check (reported_by_id = auth.uid());

-- Mark Resolved is the only update path — allowed for the parent
-- task's assignee or an admin, matching the documented behavior
-- exactly (README: "available to the ticket's assignee or any admin").
create policy "bug_reports_update_resolve" on bug_reports
  for update
  using (
    exists (
      select 1 from tasks t
      where t.id = bug_reports.task_id
        and (
          t.assignee = (select username from profiles where id = auth.uid())
          or exists (select 1 from profiles where id = auth.uid() and is_admin)
        )
    )
  );

-- No delete policy: no delete UI exists for bug reports.

-- ============================================================
-- 7. test_evidence
-- ============================================================

drop policy if exists "test_evidence_all" on test_evidence;

create policy "test_evidence_select" on test_evidence
  for select using (true);

create policy "test_evidence_insert" on test_evidence
  for insert
  with check (submitted_by_id = auth.uid());

-- No update/delete policy: append-only log, by design.
