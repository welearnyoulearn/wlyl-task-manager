-- ============================================================
-- Migration: file attachments (Cloudflare R2) for task description,
-- test plan, and Fail QA screenshots.
-- Run this in the Supabase SQL editor after 001-014.
--
-- Files themselves live in R2, not in Supabase - these columns only
-- store the public URL + original filename the browser gets back from
-- the r2-upload Edge Function after a successful upload. Uploading
-- goes through that function (server-side, holds the R2 secret key)
-- rather than any client-side R2 credential, so nothing sensitive
-- reaches the browser bundle. See supabase/functions/r2-upload.
-- ============================================================

-- PART 1 - tasks: one optional file on the description (set by the
-- admin on Assign Task) and one optional file on the test plan (set by
-- the developer on Mark Ready for QA, alongside the existing mandatory
-- text field - the file is a supplement, not a replacement).
alter table tasks
  add column if not exists description_file_url text,
  add column if not exists description_file_name text,
  add column if not exists test_plan_file_url text,
  add column if not exists test_plan_file_name text;

-- PART 2 - bug_reports: up to 5 screenshots attached when failing QA,
-- as an array of R2 URLs. Kept separate from the existing evidence_url
-- text column (a free-text link a tester can still paste manually) -
-- evidence_urls is specifically the uploaded-screenshot set. The
-- 5-item cap is enforced in the UI (upload picker) and re-checked here
-- so a direct API call can't exceed it either.
alter table bug_reports
  add column if not exists evidence_urls text[] not null default '{}';

alter table bug_reports
  drop constraint if exists bug_reports_evidence_urls_max5;
alter table bug_reports
  add constraint bug_reports_evidence_urls_max5 check (array_length(evidence_urls, 1) is null or array_length(evidence_urls, 1) <= 5);
