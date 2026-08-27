// Edge Function: send transactional email via Zoho Mail SMTP.
// Runs with the Zoho app-specific password server-side, never exposed
// to the client. Deploy: supabase functions deploy send-email
//
// Generic sender, not tied to one notification type - task-assigned
// emails call it directly from the client (see src/lib/email.js); the
// due-date reminder scheduled function (supabase/functions/due-date-reminders)
// calls it internally. Any authenticated app user may trigger a send
// (same as r2-upload) - this function only proves "a logged-in user
// asked"; it's not itself a privileged action, just a mail relay.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ZOHO_SMTP_USER = Deno.env.get('ZOHO_SMTP_USER')!; // e.g. admin@welearnyoulearn.com
const ZOHO_SMTP_PASSWORD = Deno.env.get('ZOHO_SMTP_PASSWORD')!; // app-specific password, not the account login password

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

  const client = new SMTPClient({
    connection: {
      hostname: 'smtp.zoho.com',
      port: 587,
      tls: false, // STARTTLS
      auth: { username: ZOHO_SMTP_USER, password: ZOHO_SMTP_PASSWORD }
    }
  });

  try {
    await client.send({
      from: `WLYL Hub <${ZOHO_SMTP_USER}>`,
      to,
      subject,
      content: text || 'This email requires an HTML-capable client to view.',
      html: html || undefined
    });
    await client.close();
    return jsonResponse({ ok: true }, 200);
  } catch (e) {
    try { await client.close(); } catch { /* already closed/failed */ }
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
