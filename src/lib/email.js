import { sb } from './supabase.js';

const SUPABASE_URL = 'https://qpchsvngmvpswwwjqaza.supabase.co';
const SEND_EMAIL_FN_URL = `${SUPABASE_URL}/functions/v1/send-email`;

const APP_URL = 'https://wlylhub.welearnyoulearn.com';

// Failures here are deliberately swallowed by callers (not re-thrown) -
// a notification email failing to send should never block or roll back
// the actual app action (assigning a task, etc). Logged to the console
// so it's visible during development/debugging without surfacing a
// toast for something the user didn't directly ask for.
export async function sendEmail({ to, subject, html, text }) {
  if (!to) return; // no real email on file for this profile yet - silently skip
  try {
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return;
    const res = await fetch(SEND_EMAIL_FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, subject, html, text })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error('sendEmail failed:', body.error || res.status);
    }
  } catch (e) {
    console.error('sendEmail failed:', e.message);
  }
}

function ticketUrl(ticketId) {
  return `${APP_URL}/?ticket=${encodeURIComponent(ticketId)}`;
}

export function sendTaskAssignedEmail({ to, ticketId, title, description, dueDate, assigneeName }) {
  const link = ticketUrl(ticketId);
  const subject = `[${ticketId}] New ticket assigned to you: ${title}`;
  const html = `
    <p>Hi ${assigneeName},</p>
    <p>You've been assigned a new ticket.</p>
    <p>
      <strong>Ticket:</strong> ${ticketId}<br/>
      <strong>Title:</strong> ${title}<br/>
      ${dueDate ? `<strong>Due:</strong> ${dueDate}<br/>` : ''}
    </p>
    ${description ? `<p><strong>Details:</strong><br/>${escapeHtml(description).replace(/\n/g, '<br/>')}</p>` : ''}
    <p><a href="${link}">Open in WLYL Hub</a></p>
  `;
  const text = [
    `Hi ${assigneeName},`,
    `You've been assigned a new ticket.`,
    `Ticket: ${ticketId}`,
    `Title: ${title}`,
    dueDate ? `Due: ${dueDate}` : '',
    description ? `Details:\n${description}` : '',
    `Open in WLYL Hub: ${link}`
  ].filter(Boolean).join('\n\n');
  return sendEmail({ to, subject, html, text });
}

// Fired when a tester fails QA on a ticket - notifies whoever needs to
// act next: the ticket's developer (assignee) so they can rework the
// issue and mark it Ready for QA again, and every admin so the failure
// isn't only visible to someone who has to go looking for it.
export function sendQaFailedEmail({ to, recipientName, ticketId, title, reporterName, severity, stepsToReproduce, expectedBehavior, actualBehavior }) {
  const link = ticketUrl(ticketId);
  const subject = `[${ticketId}] QA failed: ${title}`;
  const html = `
    <p>Hi ${recipientName},</p>
    <p><strong>${ticketId} — ${title}</strong> failed QA, reported by ${reporterName}.</p>
    <p>
      <strong>Severity:</strong> ${severity}<br/>
    </p>
    <p><strong>Steps to reproduce:</strong><br/>${escapeHtml(stepsToReproduce).replace(/\n/g, '<br/>')}</p>
    <p><strong>Expected:</strong><br/>${escapeHtml(expectedBehavior).replace(/\n/g, '<br/>')}</p>
    <p><strong>Actual:</strong><br/>${escapeHtml(actualBehavior).replace(/\n/g, '<br/>')}</p>
    <p>Please rework the issue and mark it Ready for QA again once fixed.</p>
    <p><a href="${link}">Open in WLYL Hub</a></p>
  `;
  const text = [
    `Hi ${recipientName},`,
    `${ticketId} - ${title} failed QA, reported by ${reporterName}.`,
    `Severity: ${severity}`,
    `Steps to reproduce:\n${stepsToReproduce}`,
    `Expected:\n${expectedBehavior}`,
    `Actual:\n${actualBehavior}`,
    `Please rework the issue and mark it Ready for QA again once fixed.`,
    `Open in WLYL Hub: ${link}`
  ].filter(Boolean).join('\n\n');
  return sendEmail({ to, subject, html, text });
}

// Fired when someone posts a comment on a ticket - comments previously
// had no notification path at all, so a follow-up like "need updated
// document" only reached the other person if they happened to reopen
// the ticket. Sent to every other participant (assignee, QA assignee,
// the admin who assigned it), never back to the commenter themselves -
// callers build that recipient list and call this once per recipient.
export function sendCommentPostedEmail({ to, recipientName, ticketId, title, authorName, text }) {
  const link = ticketUrl(ticketId);
  const subject = `[${ticketId}] New comment from ${authorName}: ${title}`;
  const html = `
    <p>Hi ${recipientName},</p>
    <p>${authorName} commented on <strong>${ticketId} — ${title}</strong>:</p>
    <p style="padding:10px 14px;background:#f4f2ea;border-left:3px solid #1F8A70;border-radius:4px;">${escapeHtml(text).replace(/\n/g, '<br/>')}</p>
    <p><a href="${link}">Open in WLYL Hub</a></p>
  `;
  const textBody = [
    `Hi ${recipientName},`,
    `${authorName} commented on ${ticketId} - ${title}:`,
    `"${text}"`,
    `Open in WLYL Hub: ${link}`
  ].join('\n\n');
  return sendEmail({ to, subject, html, text: textBody });
}

// Fired once, immediately, when an admin schedules a new meeting - on
// top of (not instead of) the morning-of and ~15-min-before reminders
// from the meeting-reminders cron. Gives people the details up front
// so they can plan around it, rather than only finding out the morning
// it happens.
export function sendMeetingScheduledEmail({ to, recipientName, title, scheduleLabel, linkUrl, scheduledBy }) {
  const subject = `New meeting scheduled: ${title}`;
  const html = `
    <p>Hi ${recipientName},</p>
    <p><strong>${title}</strong> has been scheduled by ${scheduledBy}.</p>
    <p><strong>When:</strong> ${scheduleLabel}</p>
    <p><a href="${linkUrl}">${linkUrl}</a></p>
    <p>You'll also get a reminder the morning of, and again about 15 minutes before it starts.</p>
  `;
  const text = [
    `Hi ${recipientName},`,
    `${title} has been scheduled by ${scheduledBy}.`,
    `When: ${scheduleLabel}`,
    `Join: ${linkUrl}`,
    `You'll also get a reminder the morning of, and again about 15 minutes before it starts.`
  ].join('\n\n');
  return sendEmail({ to, subject, html, text });
}

// Fired once when an admin reschedules an already-created meeting
// (kind/weekday/date/time actually changed) - shows both the old and
// new schedule so recipients immediately see what moved, rather than
// silently invalidating whatever they'd already planned around from
// the original "scheduled" email.
export function sendMeetingRescheduledEmail({ to, recipientName, title, oldScheduleLabel, newScheduleLabel, linkUrl, updatedBy }) {
  const subject = `Meeting rescheduled: ${title}`;
  const html = `
    <p>Hi ${recipientName},</p>
    <p><strong>${title}</strong> has been rescheduled by ${updatedBy}.</p>
    <p><strong>Was:</strong> ${oldScheduleLabel}<br/>
       <strong>Now:</strong> ${newScheduleLabel}</p>
    <p><a href="${linkUrl}">${linkUrl}</a></p>
  `;
  const text = [
    `Hi ${recipientName},`,
    `${title} has been rescheduled by ${updatedBy}.`,
    `Was: ${oldScheduleLabel}`,
    `Now: ${newScheduleLabel}`,
    `Join: ${linkUrl}`
  ].join('\n\n');
  return sendEmail({ to, subject, html, text });
}

// Fired once when an admin cancels a meeting - the only way a meeting
// stops appearing (see cancelMeeting in MeetingsPanel.jsx: soft-cancel
// via cancelled_at, not a hard delete), so this is the one place
// recipients learn it's no longer happening at all.
export function sendMeetingCancelledEmail({ to, recipientName, title, scheduleLabel, cancelledBy }) {
  const subject = `Meeting cancelled: ${title}`;
  const html = `
    <p>Hi ${recipientName},</p>
    <p><strong>${title}</strong> (${scheduleLabel}) has been cancelled by ${cancelledBy}.</p>
    <p>No further reminders will be sent for it.</p>
  `;
  const text = [
    `Hi ${recipientName},`,
    `${title} (${scheduleLabel}) has been cancelled by ${cancelledBy}.`,
    `No further reminders will be sent for it.`
  ].join('\n\n');
  return sendEmail({ to, subject, html, text });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
