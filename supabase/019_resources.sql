-- ============================================================
-- Migration: Resources — an admin-maintained, team-wide shared board
-- for reference info that isn't a task (dev/staging links, credentials,
-- shared drive folders, docs, etc). Run this in the Supabase SQL editor
-- after 001-018.
--
-- Any admin can add/edit/delete a resource; every signed-in member
-- (any role) can read the list. Same select-wide-open / write-gated
-- pattern as every other table since 006_rls_hardening.sql.
-- ============================================================

create table if not exists resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  link_url text,
  file_url text,
  file_name text,
  created_by text not null,           -- username, same convention as tasks.assignee
  created_by_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resources_created_at_idx on resources (created_at desc);

alter table resources enable row level security;

drop policy if exists "resources_select" on resources;
create policy "resources_select" on resources
  for select using (true);

drop policy if exists "resources_insert_admin" on resources;
create policy "resources_insert_admin" on resources
  for insert
  with check (
    exists (select 1 from profiles where id = auth.uid() and is_admin)
  );

drop policy if exists "resources_update_admin" on resources;
create policy "resources_update_admin" on resources
  for update
  using (
    exists (select 1 from profiles where id = auth.uid() and is_admin)
  );

drop policy if exists "resources_delete_admin" on resources;
create policy "resources_delete_admin" on resources
  for delete
  using (
    exists (select 1 from profiles where id = auth.uid() and is_admin)
  );
