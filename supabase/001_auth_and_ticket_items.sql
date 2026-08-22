-- ============================================================
-- Migration: real Supabase Auth + per-bullet ticket linking
-- Run this in the Supabase SQL editor (Project > SQL Editor > New query).
-- Additive only: existing admins/members/weekly_updates/tasks/task_comments
-- tables and data are untouched. Safe to run while the current app is live.
-- ============================================================

-- 1. profiles table: source of truth for "who is this person / are they admin"
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2. weekly_update_items: one row per bullet, each with its own ticket link
create table if not exists weekly_update_items (
  id uuid primary key default gen_random_uuid(),
  weekly_update_id uuid not null references weekly_updates(id) on delete cascade,
  section text not null check (section in ('completed', 'in_progress')),
  text text not null,
  ticket_id text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists weekly_update_items_parent_idx
  on weekly_update_items (weekly_update_id);

-- 3. weekly_updates.user_id: denormalized link to profiles, keeps existing
--    `name` text column working for every current render function.
alter table weekly_updates
  add column if not exists user_id uuid references profiles(id);

-- ============================================================
-- RLS — permissive-during-migration policies.
-- These allow the same read/write behavior the app has TODAY (anon key,
-- no auth.uid() check yet) so the current client keeps working unchanged
-- while Part B (client code) is being built. Once B1 ships and every
-- write goes through a real authenticated session, come back and swap
-- the "todo: tighten" policies below for auth.uid()-checked versions
-- (see the commented block at the bottom of this file).
-- ============================================================

alter table profiles enable row level security;
alter table weekly_update_items enable row level security;
alter table weekly_updates enable row level security;
alter table tasks enable row level security;
alter table task_comments enable row level security;

-- profiles: readable by anyone (needed for username -> is_admin lookups
-- during login before RLS tightening); writes only via service-role
-- (Edge Function), never from the client, so no insert/update policy here.
drop policy if exists "profiles_select_all" on profiles;
create policy "profiles_select_all" on profiles
  for select using (true);

-- weekly_updates / weekly_update_items / tasks / task_comments:
-- todo: tighten — permissive for now, matches current (no-RLS) behavior.
drop policy if exists "weekly_updates_all" on weekly_updates;
create policy "weekly_updates_all" on weekly_updates
  for all using (true) with check (true);

drop policy if exists "weekly_update_items_all" on weekly_update_items;
create policy "weekly_update_items_all" on weekly_update_items
  for all using (true) with check (true);

drop policy if exists "tasks_all" on tasks;
create policy "tasks_all" on tasks
  for all using (true) with check (true);

drop policy if exists "task_comments_all" on task_comments;
create policy "task_comments_all" on task_comments
  for all using (true) with check (true);

-- ============================================================
-- TIGHTENED POLICIES — apply these AFTER Part B1 (real auth) ships and
-- you've confirmed everyone logs in via Supabase Auth. Uncomment and run
-- as a follow-up migration; do not run alongside the permissive block above
-- (drop the permissive policy first, or Postgres will just OR them together
-- and the permissive one wins).
-- ============================================================

-- drop policy if exists "weekly_updates_all" on weekly_updates;
--
-- create policy "weekly_updates_select" on weekly_updates
--   for select using (true); -- team-wide visibility, matches current admin/member views
--
-- create policy "weekly_updates_insert" on weekly_updates
--   for insert with check (user_id = auth.uid());
--
-- create policy "weekly_updates_update" on weekly_updates
--   for update using (user_id = auth.uid());
--
-- create policy "weekly_updates_delete" on weekly_updates
--   for delete using (
--     exists (select 1 from profiles where id = auth.uid() and is_admin)
--   );
--
-- drop policy if exists "weekly_update_items_all" on weekly_update_items;
--
-- create policy "weekly_update_items_select" on weekly_update_items
--   for select using (true);
--
-- create policy "weekly_update_items_insert" on weekly_update_items
--   for insert with check (
--     exists (
--       select 1 from weekly_updates wu
--       where wu.id = weekly_update_id and wu.user_id = auth.uid()
--     )
--   );
--
-- create policy "weekly_update_items_delete" on weekly_update_items
--   for delete using (
--     exists (
--       select 1 from weekly_updates wu
--       where wu.id = weekly_update_id and wu.user_id = auth.uid()
--     )
--   );
--
-- drop policy if exists "tasks_all" on tasks;
--
-- create policy "tasks_select" on tasks
--   for select using (true);
--
-- create policy "tasks_insert" on tasks
--   for insert with check (
--     exists (select 1 from profiles where id = auth.uid() and is_admin)
--   );
--
-- create policy "tasks_delete" on tasks
--   for delete using (
--     exists (select 1 from profiles where id = auth.uid() and is_admin)
--   );
--
-- create policy "tasks_update_own_or_admin" on tasks
--   for update using (
--     assignee = (select username from profiles where id = auth.uid())
--     or exists (select 1 from profiles where id = auth.uid() and is_admin)
--   );
--
-- drop policy if exists "task_comments_all" on task_comments;
--
-- create policy "task_comments_select" on task_comments
--   for select using (true);
--
-- create policy "task_comments_insert" on task_comments
--   for insert with check (
--     author = (select username from profiles where id = auth.uid())
--   );
