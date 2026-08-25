-- ============================================================
-- Migration: bug_reports.reported_by / test_evidence.submitted_by
-- from text username to a real profiles(id) UUID foreign key.
-- Run this in the Supabase SQL editor after 001-004.
--
-- SAFE / NON-DESTRUCTIVE BY DESIGN — this file only ADDS a column and
-- BACKFILLS it. It does NOT drop the old text column. See the bottom of
-- this file for what to do next, and do not run PART 2 (the drop) until
-- you've reviewed the orphan-row report PART 1 produces below.
-- ============================================================

-- ============================================================
-- PART 1 — add + backfill (run this now)
-- ============================================================

-- 1. Add the new UUID FK columns, nullable for now (some existing rows
--    may not backfill cleanly — see the orphan check below — and a
--    NOT NULL constraint would block the migration from running at all
--    on data we haven't verified yet).
alter table bug_reports
  add column if not exists reported_by_id uuid references profiles(id);

alter table test_evidence
  add column if not exists submitted_by_id uuid references profiles(id);

-- 2. Backfill by matching the existing text username to profiles.username.
--    Case-insensitive match: the app's login path already lowercases
--    every username before use (see AuthContext.jsx), but this is
--    defense-in-depth against any row written before that was
--    consistently true, or typed some other way.
update bug_reports br
set reported_by_id = p.id
from profiles p
where lower(p.username) = lower(br.reported_by)
  and br.reported_by_id is null;

update test_evidence te
set submitted_by_id = p.id
from profiles p
where lower(p.username) = lower(te.submitted_by)
  and te.submitted_by_id is null;

-- 3. Orphan check — rows where the text username didn't match any
--    profiles.username. Run these two SELECTs and report the results
--    (row counts AND the actual reported_by/submitted_by values) before
--    doing anything else. If either returns any rows, STOP: do not run
--    PART 2 below until you've decided how to handle them (fix the
--    orphaned text value, create a matching profile, or accept data
--    loss for that specific row and say so explicitly).

select id, task_id, reported_by, created_at
from bug_reports
where reported_by_id is null;

select id, task_id, submitted_by, created_at
from test_evidence
where submitted_by_id is null;

-- ============================================================
-- PART 2 — drop the old text columns (DO NOT RUN YET)
--
-- Only run the statements below after:
--   (a) both orphan-check SELECTs above returned zero rows, AND
--   (b) the application code has been updated and deployed to write
--       reported_by_id / submitted_by_id instead of reported_by /
--       submitted_by on every new insert (otherwise new rows will keep
--       arriving with the old column populated and the new one null).
--
-- Uncomment and run as a follow-up once both conditions are confirmed.
-- ============================================================

-- alter table bug_reports
--   alter column reported_by_id set not null;
-- alter table bug_reports
--   drop column reported_by;

-- alter table test_evidence
--   alter column submitted_by_id set not null;
-- alter table test_evidence
--   drop column submitted_by;
