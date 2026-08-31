import { sb } from './supabase.js';

const SUPABASE_URL = 'https://qpchsvngmvpswwwjqaza.supabase.co';
const CREATE_GOOGLE_MEET_FN_URL = `${SUPABASE_URL}/functions/v1/create-google-meet`;

// Generates a real, reusable Google Meet link for a meeting. The
// underlying calendar event is a throwaway - no attendees are added
// and Google is told not to send any notification (sendUpdates:
// 'none') - the app's own meeting-reminders Edge Function stays the
// only path that actually notifies anyone, admin-only just like every
// other privileged write in this app (checked server-side).
export async function createGoogleMeetLink({ title, startDateTime, endDateTime }) {
  const { data: sessionData } = await sb.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Not signed in.');
  const res = await fetch(CREATE_GOOGLE_MEET_FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title, startDateTime, endDateTime })
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Could not create Google Meet link.');
  return body;
}
