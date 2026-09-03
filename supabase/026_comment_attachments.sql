-- ============================================================
-- Migration: file attachments on ticket comments (up to 5 per comment).
-- Run this in the Supabase SQL editor after 001-025.
--
-- task_comments previously had no attachment column at all - any
-- follow-up reply (e.g. "here's the updated document") had to paste a
-- link in the text body. Adds an array column, same pattern as
-- bug_reports.evidence_urls (015/016) - files themselves live in R2,
-- this just stores the public URLs + original filenames the browser
-- gets back from the r2-upload Edge Function after a successful
-- upload.
-- ============================================================

alter table task_comments
  add column if not exists attachment_urls text[] not null default '{}',
  add column if not exists attachment_names text[] not null default '{}';

alter table task_comments
  drop constraint if exists task_comments_attachments_max5;
alter table task_comments
  add constraint task_comments_attachments_max5 check (array_length(attachment_urls, 1) is null or array_length(attachment_urls, 1) <= 5);
