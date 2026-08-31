-- ============================================================
-- Migration: per-meeting recipient selection - "everyone" (default,
-- same behavior as before) or a specific set of people. Run this in
-- the Supabase SQL editor after 001-021.
-- ============================================================

alter table meeting_schedules
  add column if not exists recipient_mode text not null default 'everyone'
    check (recipient_mode in ('everyone', 'custom')),
  add column if not exists recipient_ids uuid[];
