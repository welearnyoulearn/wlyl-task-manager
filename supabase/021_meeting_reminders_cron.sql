-- ============================================================
-- Meeting reminder crons.
-- Two jobs firing the meeting-reminders Edge Function:
--   - once a day at 09:00 IST (03:30 UTC), mode "morning" - same slot
--     due-date-reminders already uses (018_due_date_reminder_cron.sql)
--   - every 5 minutes, mode "soon" - catches meetings starting in the
--     next 0-15 minutes; the function's own unique-constraint guard
--     (meeting_notifications_log) stops it from double-sending across
--     the several runs that can land inside that window.
-- Run this only after supabase/functions/meeting-reminders has been
-- built AND deployed (`supabase functions deploy meeting-reminders`),
-- or these will fail silently every time they fire - same caveat as
-- 018's own comment.
-- Requires pg_cron and pg_net (already enabled by 018 if that migration
-- has run; the "create extension if not exists" calls below are just
-- defensive in case this runs standalone).
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'meeting-reminders-morning',
  '30 3 * * *',
  $$
  select net.http_post(
    url := 'https://qpchsvngmvpswwwjqaza.supabase.co/functions/v1/meeting-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_qUcXd4zGPoeluQND5_WJpQ_7torE5Zr'
    ),
    body := '{"mode":"morning"}'::jsonb
  );
  $$
);

select cron.schedule(
  'meeting-reminders-soon',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://qpchsvngmvpswwwjqaza.supabase.co/functions/v1/meeting-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_qUcXd4zGPoeluQND5_WJpQ_7torE5Zr'
    ),
    body := '{"mode":"soon"}'::jsonb
  );
  $$
);
