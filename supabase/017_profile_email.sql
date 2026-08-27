-- ============================================================
-- Migration: real email address per profile, for notification emails.
-- Run this in the Supabase SQL editor after 001-016.
--
-- Every account's auth.users.email is a synthetic {username}@wlyl.local
-- address (see toSyntheticEmail in src/lib/utils.js / manage-user Edge
-- Function) used only to satisfy Supabase Auth's login requirement -
-- it was never meant to receive real mail. This adds a genuine,
-- separate email column on profiles for that purpose. Nullable and not
-- backfilled here - existing accounts (as of this migration, just the
-- one remaining admin after the recent data reset) need their real
-- address set manually via Manage Admins/Manage Members once the UI
-- for it exists; new accounts collect it at creation time going
-- forward.
-- ============================================================

alter table profiles
  add column if not exists email text;
