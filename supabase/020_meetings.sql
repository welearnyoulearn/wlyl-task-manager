-- ============================================================
-- Migration: Meetings — admin-scheduled recurring or one-off team
-- meetings, with automated email reminders (see the meeting-reminders
-- Edge Function + 021_meeting_reminders_cron.sql). Run this in the
-- Supabase SQL editor after 001-019.
-- ============================================================

create table if not exists meeting_schedules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  link_url text not null,
  kind text not null check (kind in ('recurring', 'one_off')),
  weekday int check (weekday between 0 and 6),   -- 0=Sunday..6=Saturday; set iff kind='recurring'
  specific_date date,                             -- set iff kind='one_off'
  time_of_day time not null,                      -- wall-clock IST, e.g. '17:00'
  active boolean not null default true,
  created_by text not null,
  created_by_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_schedule_kind_fields check (
    (kind = 'recurring' and weekday is not null and specific_date is null)
    or (kind = 'one_off' and specific_date is not null and weekday is null)
  )
);

-- Logs which reminder emails have already gone out for a given
-- occurrence, so the every-5-minutes "soon" cron (which may see the
-- same upcoming meeting across several runs) never double-sends. The
-- unique constraint is the actual guard - the Edge Function relies on
-- its insert failing (23505) to know a reminder was already sent.
create table if not exists meeting_notifications_log (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references meeting_schedules(id) on delete cascade,
  occurrence_date date not null,
  kind text not null check (kind in ('morning', 'soon')),
  sent_at timestamptz not null default now(),
  unique (schedule_id, occurrence_date, kind)
);

alter table meeting_schedules enable row level security;

drop policy if exists "meeting_schedules_select" on meeting_schedules;
create policy "meeting_schedules_select" on meeting_schedules
  for select using (true);

drop policy if exists "meeting_schedules_insert_admin" on meeting_schedules;
create policy "meeting_schedules_insert_admin" on meeting_schedules
  for insert
  with check (
    exists (select 1 from profiles where id = auth.uid() and is_admin)
  );

drop policy if exists "meeting_schedules_update_admin" on meeting_schedules;
create policy "meeting_schedules_update_admin" on meeting_schedules
  for update
  using (
    exists (select 1 from profiles where id = auth.uid() and is_admin)
  );

drop policy if exists "meeting_schedules_delete_admin" on meeting_schedules;
create policy "meeting_schedules_delete_admin" on meeting_schedules
  for delete
  using (
    exists (select 1 from profiles where id = auth.uid() and is_admin)
  );

-- meeting_notifications_log: RLS enabled, deliberately zero client
-- policies - only the meeting-reminders Edge Function (service role,
-- bypasses RLS) ever reads or writes this table.
alter table meeting_notifications_log enable row level security;
