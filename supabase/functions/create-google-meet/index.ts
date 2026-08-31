// Edge Function: generate a Google Meet link via the Calendar API.
// Deploy: supabase functions deploy create-google-meet
//
// Used only to mint a reusable Meet link when an admin schedules a
// meeting - it is NOT how attendees get notified. sendUpdates: 'none'
// and no `attendees` on the created event means Google never emails
// anyone; the app's own meeting-reminders Edge Function (morning-of +
// ~15-min-before, via Resend) stays the only notification path, same
// as if the admin had pasted a Zoom link manually.
//
// Auth: a one-time OAuth 2.0 authorization (see scripts/get-google-refresh-token.mjs)
// against a single Google account's calendar - works with any regular
// Google account, no Google Workspace subscription needed. The refresh
// token is exchanged for a short-lived access token on every call; it
// does not expire under normal use (only if revoked or unused for 6
// months), same lifetime model as the R2/Resend secrets already used
// elsewhere in this app.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const GOOGLE_REFRESH_TOKEN = Deno.env.get('GOOGLE_REFRESH_TOKEN')!;

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

async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error_description || body.error || 'Could not refresh Google access token');
  return body.access_token;
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

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', callerUser.user.id)
    .single();
  if (!callerProfile?.is_admin) {
    return jsonResponse({ error: 'Admin access required' }, 403);
  }

  let body: { title?: string; startDateTime?: string; endDateTime?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  const { title, startDateTime, endDateTime } = body;
  if (!title || !startDateTime || !endDateTime) {
    return jsonResponse({ error: 'title, startDateTime, and endDateTime are required' }, 400);
  }

  try {
    const accessToken = await getAccessToken();

    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          summary: title,
          start: { dateTime: startDateTime, timeZone: 'Asia/Kolkata' },
          end: { dateTime: endDateTime, timeZone: 'Asia/Kolkata' },
          conferenceData: {
            createRequest: {
              requestId: crypto.randomUUID(),
              conferenceSolutionKey: { type: 'hangoutsMeet' }
            }
          }
        })
      }
    );
    const event = await res.json();
    if (!res.ok) {
      throw new Error(event.error?.message || `Calendar API request failed (${res.status})`);
    }
    if (!event.hangoutLink) {
      throw new Error('Google did not return a Meet link for this event');
    }

    return jsonResponse({ meetLink: event.hangoutLink, eventId: event.id }, 200);
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
