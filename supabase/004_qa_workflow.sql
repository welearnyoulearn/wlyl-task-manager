-- ============================================================
-- Migration: QA workflow (qa_status, bug_reports, test_evidence)
-- Run this in the Supabase SQL editor after 001-003.
-- Additive only: the existing `tasks.status` column (dev workflow:
-- Assigned/Not Started/In Progress/Blocked/Done) is untouched, and no
-- existing row is modified beyond getting the new qa_status default.
-- Only tasks/tickets are affected — weekly_updates, weekly_update_comments,
-- and profiles are not touched by this migration.
-- ============================================================

-- 1. tasks.qa_status: QA verification state, independent of dev `status`.
alter table tasks
  add column if not exists qa_status text not null default 'Not Ready'
  check (qa_status in ('Not Ready', 'Ready for QA', 'In QA', 'Passed', 'Failed'));

-- 2. bug_reports: zero or more bugs logged against a ticket during QA.
create table if not exists bug_reports (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  reported_by text not null, -- username, matching tasks.assignee / task_comments.author
  steps_to_reproduce text not null,
  expected_behavior text not null,
  actual_behavior text not null,
  severity text not null check (severity in ('Blocker', 'Major', 'Minor', 'Cosmetic')),
  environment text,
  evidence_url text,
  resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists bug_reports_task_idx on bug_reports (task_id);

-- 3. test_evidence: Playwright run results attached to a ticket.
create table if not exists test_evidence (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  submitted_by text not null, -- username, matching tasks.assignee / task_comments.author
  run_url text not null,
  passed_count int not null default 0,
  failed_count int not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists test_evidence_task_idx on test_evidence (task_id);

-- ============================================================
-- RLS — permissive, matching the current interim pattern used by every
-- other table (see 001_auth_and_ticket_items.sql). Tightening is Phase 3.
-- ============================================================

alter table bug_reports enable row level security;
alter table test_evidence enable row level security;

drop policy if exists "bug_reports_all" on bug_reports;
create policy "bug_reports_all" on bug_reports
  for all using (true) with check (true);

drop policy if exists "test_evidence_all" on test_evidence;
create policy "test_evidence_all" on test_evidence
  for all using (true) with check (true);
