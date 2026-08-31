// Edge Function: meeting reminder sweep.
// Deploy: supabase functions deploy meeting-reminders
// Schedule: supabase/021_meeting_reminders_cron.sql sets up two pg_cron
// jobs that invoke this - one daily at 09:00 IST with {"mode":"morning"},
// one every 5 minutes with {"mode":"soon"} - same pg_cron + pg_net
// pattern as due-date-reminders (see supabase/018_due_date_reminder_cron.sql).
//
// Like due-date-reminders, this runs with the service role key directly
// (no caller-JWT check) because pg_cron invokes it on a schedule, not a
// logged-in browser session - it is not exposed for arbitrary client
// calls in the UI.
//
// All time math is done in IST (UTC+5:30, fixed - no DST, no per-meeting
// timezone) by shifting the current UTC instant forward 5.5 hours and
// reading weekday/date/time off the shifted instant's UTC fields. This
// mirrors the assumption already baked into 018's cron string (03:30 UTC
// = 09:00 IST), just made explicit in code here since "soon" needs
// same-day time-of-day arithmetic, not just a fixed daily UTC offset.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const RESEND_FROM = Deno.env.get('RESEND_FROM') || 'WLYL Hub <onboarding@resend.dev>';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

type Schedule = {
  id: string;
  title: string;
  link_url: string;
  kind: 'recurring' | 'one_off';
  weekday: number | null;
  specific_date: string | null;
  time_of_day: string; // 'HH:MM:SS'
  recipient_mode: 'everyone' | 'custom';
  recipient_ids: string[] | null;
};
type Profile = { id: string; username: string; email: string | null };

function istNow(): Date {
  return new Date(Date.now() + IST_OFFSET_MS);
}

// The shifted instant's UTC fields read as IST wall-clock fields - same
// trick istNow() itself relies on.
function istParts(d: Date) {
  return {
    weekday: d.getUTCDay(),
    date: d.toISOString().slice(0, 10),
    hours: d.getUTCHours(),
    minutes: d.getUTCMinutes()
  };
}

function buildEmail(kind: 'morning' | 'soon', schedule: Schedule) {
  const timeLabel = schedule.time_of_day.slice(0, 5);
  const subject = kind === 'morning'
    ? `[Meeting today] ${schedule.title} at ${timeLabel} IST`
    : `[Starting soon] ${schedule.title} in ~15 min`;
  const line = kind === 'morning'
    ? `is scheduled today at ${timeLabel} IST.`
    : `starts in about 15 minutes (${timeLabel} IST).`;
  const html = `<p><strong>${schedule.title}</strong> ${line}</p><p><a href="${schedule.link_url}">${schedule.link_url}</a></p>`;
  const text = `${schedule.title} ${line}\n\nJoin: ${schedule.link_url}`;
  return { subject, html, text };
}

Deno.serve(async (req) => {
  let body: { mode?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const mode = body.mode === 'morning' || body.mode === 'soon' ? body.mode : null;
  if (!mode) {
    return new Response(JSON.stringify({ error: 'mode must be "morning" or "soon"' }), { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = istNow();
  const { weekday, date: today, hours, minutes } = istParts(now);

  const { data: schedules, error: schedulesErr } = await admin
    .from('meeting_schedules')
    .select('id, title, link_url, kind, weekday, specific_date, time_of_day, recipient_mode, recipient_ids')
    .eq('active', true)
    .or(`and(kind.eq.recurring,weekday.eq.${weekday}),and(kind.eq.one_off,specific_date.eq.${today})`);
  if (schedulesErr) {
    return new Response(JSON.stringify({ error: schedulesErr.message }), { status: 500 });
  }

  const { data: profiles, error: profilesErr } = await admin.from('profiles').select('id, username, email');
  if (profilesErr) {
    return new Response(JSON.stringify({ error: profilesErr.message }), { status: 500 });
  }
  const everyone = (profiles as Profile[]).filter(p => !!p.email);
  const profileById = new Map((profiles as Profile[]).map(p => [p.id, p]));

  // "custom" mode targets exactly the people picked when scheduling the
  // meeting; "everyone" (the default, and pre-existing behavior) keeps
  // going to every profile with an email on file.
  function recipientsFor(schedule: Schedule): Profile[] {
    if (schedule.recipient_mode !== 'custom') return everyone;
    return (schedule.recipient_ids || [])
      .map(id => profileById.get(id))
      .filter((p): p is Profile => !!p && !!p.email);
  }

  let sent = 0;
  let skippedAlreadySent = 0;
  const errors: string[] = [];

  for (const schedule of (schedules as Schedule[])) {
    if (mode === 'soon') {
      const [schHours, schMinutes] = schedule.time_of_day.split(':').map(Number);
      const minutesUntil = (schHours * 60 + schMinutes) - (hours * 60 + minutes);
      if (minutesUntil < 0 || minutesUntil > 15) continue;
    }

    // Idempotency guard: try to claim this (schedule, day, kind) slot
    // before sending anything. A unique-violation means another run
    // already sent it - skip silently, this is the expected steady
    // state for most of the 5-minute-cron's runs inside the window.
    const { error: logErr } = await admin.from('meeting_notifications_log').insert({
      schedule_id: schedule.id,
      occurrence_date: today,
      kind: mode
    });
    if (logErr) {
      if (logErr.code === '23505') { skippedAlreadySent++; continue; }
      errors.push(`${schedule.title}: ${logErr.message}`);
      continue;
    }

    const { subject, html, text } = buildEmail(mode, schedule);
    for (const recipient of recipientsFor(schedule)) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({ from: RESEND_FROM, to: [recipient.email], subject, html, text })
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.message || `Resend request failed (${res.status})`);
        }
        sent++;
      } catch (e) {
        errors.push(`${schedule.title} -> ${recipient.username}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return new Response(JSON.stringify({ mode, sent, skippedAlreadySent, errors }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
});
