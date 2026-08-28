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

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
