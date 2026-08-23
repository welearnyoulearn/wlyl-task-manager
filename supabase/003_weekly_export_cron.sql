-- ============================================================
-- Weekly export cron — DO NOT RUN YET.
-- This fires the weekly-export Edge Function every Sunday at 00:00 IST
-- (18:30 UTC Saturday). The weekly-export function does not exist yet —
-- run this only after that function has been built and deployed, or the
-- cron job will just fail silently every week with no effect.
-- Requires pg_cron and pg_net extensions (enabled by default on most
-- Supabase projects; if this errors, enable them first under
-- Database > Extensions).
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'weekly-export-sunday',
  '30 18 * * 6',
  $$
  select net.http_post(
    url := 'https://qpchsvngmvpswwwjqaza.supabase.co/functions/v1/weekly-export',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_qUcXd4zGPoeluQND5_WJpQ_7torE5Zr'
    ),
    body := '{}'::jsonb
  );
  $$
);
