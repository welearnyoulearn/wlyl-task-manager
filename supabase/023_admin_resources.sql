-- ============================================================
-- Migration: Admin Resources — a separate, admin-only counterpart to
-- the team-wide Resources board (019_resources.sql). Same content
-- shape (title, free text, link, optional file), but both read AND
-- write are admin-only here - a regular member should never even know
-- these rows exist. Run this in the Supabase SQL editor after 001-022.
-- ============================================================

create table if not exists admin_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  link_url text,
  file_url text,
  file_name text,
  created_by text not null,
  created_by_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_resources_created_at_idx on admin_resources (created_at desc);

alter table admin_resources enable row level security;

drop policy if exists "admin_resources_select_admin" on admin_resources;
create policy "admin_resources_select_admin" on admin_resources
  for select
  using (
    exists (select 1 from profiles where id = auth.uid() and is_admin)
  );

drop policy if exists "admin_resources_insert_admin" on admin_resources;
create policy "admin_resources_insert_admin" on admin_resources
  for insert
  with check (
    exists (select 1 from profiles where id = auth.uid() and is_admin)
  );

drop policy if exists "admin_resources_update_admin" on admin_resources;
create policy "admin_resources_update_admin" on admin_resources
  for update
  using (
    exists (select 1 from profiles where id = auth.uid() and is_admin)
  );

drop policy if exists "admin_resources_delete_admin" on admin_resources;
create policy "admin_resources_delete_admin" on admin_resources
  for delete
  using (
    exists (select 1 from profiles where id = auth.uid() and is_admin)
  );
