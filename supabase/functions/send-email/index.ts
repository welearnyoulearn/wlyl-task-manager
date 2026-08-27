// Edge Function: send transactional email via Resend's HTTP API.
// Runs with the Resend API key server-side, never exposed to the
// client. Deploy: supabase functions deploy send-email
//
// Switched from Zoho Mail SMTP after two blockers: (1) Supabase Edge
// Functions block outbound connections on ports 25/587, and (2) even
// after moving to port 465, Zoho rejected auth (535) because the
// account is on Zoho's free plan, which doesn't grant SMTP/IMAP app
// access at all - confirmed via a screenshot of Zoho's own mail
// settings showing "This feature is not available for your account"
// on IMAP. Resend sends over plain HTTPS (no SMTP, no port
// restriction) and needs no paid plan for this volume.
//
// Generic sender, not tied to one notification type - task-assigned
// emails call it directly from the client (see src/lib/email.js); the
// due-date reminder scheduled function (supabase/functions/due-date-reminders)
// calls it internally. Any authenticated app user may trigger a send
// (same as r2-upload) - this function only proves "a logged-in user
// asked"; it's not itself a privileged action, just a mail relay.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
// Resend's shared test sender - works with zero domain setup, but
// Resend restricts it to sending only to the email address on the
// Resend account itself until a custom domain is verified. Swap to a
// verified @welearnyoulearn.com address (via RESEND_FROM secret) once
// that's set up - see NOTES.md.
const RESEND_FROM = Deno.env.get('RESEND_FROM') || 'WLYL Hub <onboarding@resend.dev>';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization') || '';
  const callerToken = authHeader.replace('Bearer ', '');
  if (!callerToken) {
    return jsonResponse({ error: 'Missing auth token' }, 401);
  }

  const asCaller = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: callerUser, error: callerErr } = await asCaller.auth.getUser(callerToken);
  if (callerErr || !callerUser?.user) {
    return jsonResponse({ error: 'Invalid session' }, 401);
  }

  let body: { to?: string; subject?: string; html?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { to, subject, html, text } = body;
  if (!to || !subject || (!html && !text)) {
    return jsonResponse({ error: 'to, subject, and html or text are required' }, 400);
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [to],
        subject,
        html: html || undefined,
        text: text || undefined
      })
    });
    const resendBody = await res.json();
    if (!res.ok) {
      return jsonResponse({ error: resendBody.message || 'Resend request failed' }, 500);
    }
    return jsonResponse({ ok: true, id: resendBody.id }, 200);
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
