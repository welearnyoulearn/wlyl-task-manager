-- ============================================================
-- Due-date reminder cron.
-- Fires the due-date-reminders Edge Function once a day at 09:00 IST
-- (03:30 UTC) - a normal working-hours time to land in an inbox, not
-- the middle-of-the-night UTC slot the (still-unused) weekly-export
-- cron in 003_weekly_export_cron.sql uses for its own separate reason.
-- Run this only after supabase/functions/due-date-reminders has been
-- built AND deployed (`supabase functions deploy due-date-reminders`),
-- or the cron job will fail silently every day with no effect - same
-- caveat as 003's own comment.
-- Requires pg_cron and pg_net (enabled by default on most Supabase
-- projects; if this errors, enable them first under Database >
-- Extensions).
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'due-date-reminders-daily',
  '30 3 * * *',
  $$
  select net.http_post(
    url := 'https://qpchsvngmvpswwwjqaza.supabase.co/functions/v1/due-date-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_qUcXd4zGPoeluQND5_WJpQ_7torE5Zr'
    ),
    body := '{}'::jsonb
  );
  $$
);
