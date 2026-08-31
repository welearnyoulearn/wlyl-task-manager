-- ============================================================
-- Migration: meeting cancellation + generated-link locking.
-- Run this in the Supabase SQL editor after 001-023.
--
-- cancelled_at: soft-cancel instead of hard delete - a cancelled
-- meeting stays in the table (audit trail, matches nothing-really-
-- deletes-in-this-app precedent like tasks.status = 'Closed') but
-- stops appearing in the UI and stops matching the meeting-reminders
-- cron's queries.
--
-- link_is_generated: true when the link came from the "Generate Meet
-- link" button (create-google-meet) rather than being pasted in
-- manually - once true, the app locks that field on future edits so a
-- link that's already been emailed out to people can't accidentally
-- be changed to something else.
-- ============================================================

alter table meeting_schedules
  add column if not exists cancelled_at timestamptz,
  add column if not exists link_is_generated boolean not null default false;
