-- ============================================================
-- Migration: comments on weekly updates + weekly export cron
-- Run this in the Supabase SQL editor after 001_auth_and_ticket_items.sql.
-- Additive only.
-- ============================================================

create table if not exists weekly_update_comments (
  id uuid primary key default gen_random_uuid(),
  weekly_update_id uuid not null references weekly_updates(id) on delete cascade,
  author text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists weekly_update_comments_parent_idx
  on weekly_update_comments (weekly_update_id);

alter table weekly_update_comments enable row level security;

drop policy if exists "weekly_update_comments_all" on weekly_update_comments;
create policy "weekly_update_comments_all" on weekly_update_comments
  for all using (true) with check (true);

-- ============================================================
-- Weekly export cron — fires the weekly-export Edge Function every
-- Sunday at 00:00 IST (18:30 UTC Saturday). Requires pg_cron and
-- pg_net extensions (enabled by default on most Supabase projects;
-- if this errors, enable them first under Database > Extensions).
--
-- IMPORTANT: replace <PROJECT_REF> and <ANON_KEY> below before running,
-- or run this block manually from the SQL editor after filling them in.
-- The function itself re-validates the caller is calling the scheduled
-- (non-download) path, so the anon key here is fine — it carries no
-- special privilege, same as every other client request in this app.
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
