-- ============================================================
-- Migration: comments on weekly updates
-- Run this in the Supabase SQL editor after 001_auth_and_ticket_items.sql.
-- Additive only — safe to run now.
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
