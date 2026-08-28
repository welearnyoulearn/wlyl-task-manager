// Edge Function: daily due-date reminder sweep.
// Deploy: supabase functions deploy due-date-reminders
// Schedule: supabase/018_due_date_reminder_cron.sql sets up a pg_cron
// job that invokes this once a day via pg_net - see that migration for
// why a DB-side cron (not an external scheduler) was used, matching
// the existing (currently unused) precedent in 003_weekly_export_cron.sql.
//
// One sweep, three buckets, evaluated fresh every run against "today":
//   - due tomorrow  -> "reminder" email
//   - due today     -> "due today" email
//   - overdue (due date already passed) -> "overdue" email, every day
//     it stays overdue, until the ticket reaches Done or Closed
// This function is NOT the r2-upload/send-email pattern of "any
// logged-in user may call it" - it runs with the service role key
// directly (no caller JWT check) because pg_cron invokes it on a
// schedule, not a logged-in browser session. It is not exposed for
// arbitrary client calls in the UI.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const RESEND_FROM = Deno.env.get('RESEND_FROM') || 'WLYL Hub <onboarding@resend.dev>';
const APP_URL = 'https://wlylhub.welearnyoulearn.com';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type Task = { id: string; ticket_id: string; title: string; due_date: string; assignee: string };
type Profile = { username: string; email: string | null };

function buildEmail(kind: 'tomorrow' | 'today' | 'overdue', task: Task) {
  const link = `${APP_URL}/?ticket=${encodeURIComponent(task.ticket_id)}`;
  const labels = {
    tomorrow: { subject: `[${task.ticket_id}] Due tomorrow: ${task.title}`, line: `is due tomorrow (${task.due_date}).` },
    today: { subject: `[${task.ticket_id}] Due today: ${task.title}`, line: `is due today (${task.due_date}).` },
    overdue: { subject: `[${task.ticket_id}] Overdue: ${task.title}`, line: `was due on ${task.due_date} and is now overdue.` }
  };
  const { subject, line } = labels[kind];
  const html = `<p>${task.ticket_id} — ${task.title} ${line}</p><p><a href="${link}">Open in WLYL Hub</a></p>`;
  const text = `${task.ticket_id} - ${task.title} ${line}\n\nOpen in WLYL Hub: ${link}`;
  return { subject, html, text };
}

Deno.serve(async (_req) => {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const today = todayIso();
  const tomorrow = addDays(today, 1);

  // Only tickets still in flight - a Done or Closed ticket has no
  // outstanding work left, so it shouldn't keep generating overdue
  // nags forever. On Hold/Assigned/Not Started/In Progress all count
  // as "still owed", including a ticket sitting On Hold past its due
  // date - the reminder is a nudge to revisit it, not an accusation
  // that dev work stalled.
  const { data: tasks, error: tasksErr } = await admin
    .from('tasks')
    .select('id, ticket_id, title, due_date, assignee')
    .not('status', 'in', '("Done","Closed")')
    .not('due_date', 'is', null);
  if (tasksErr) {
    return new Response(JSON.stringify({ error: tasksErr.message }), { status: 500 });
  }

  const { data: profiles, error: profilesErr } = await admin.from('profiles').select('username, email');
  if (profilesErr) {
    return new Response(JSON.stringify({ error: profilesErr.message }), { status: 500 });
  }
  const emailByUsername = new Map((profiles as Profile[]).map(p => [p.username.toLowerCase(), p.email]));

  let sent = 0;
  let skippedNoEmail = 0;
  const errors: string[] = [];

  for (const task of (tasks as Task[])) {
    const to = emailByUsername.get(task.assignee.toLowerCase());
    if (!to) { skippedNoEmail++; continue; }

    let kind: 'tomorrow' | 'today' | 'overdue' | null = null;
    if (task.due_date === tomorrow) kind = 'tomorrow';
    else if (task.due_date === today) kind = 'today';
    else if (task.due_date < today) kind = 'overdue';
    if (!kind) continue;

    const { subject, html, text } = buildEmail(kind, task);
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html, text })
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || `Resend request failed (${res.status})`);
      }
      sent++;
    } catch (e) {
      errors.push(`${task.ticket_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return new Response(JSON.stringify({ sent, skippedNoEmail, errors }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
});
