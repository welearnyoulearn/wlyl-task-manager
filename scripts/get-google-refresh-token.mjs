// One-time helper: authorizes this app against a Google account and
// prints the refresh token to store as the create-google-meet Edge
// Function's GOOGLE_REFRESH_TOKEN secret. Run locally, once, by
// whichever Google account should own the generated Meet links -
// any regular Google/Gmail account works, no Workspace needed.
//
// Prerequisites (Google Cloud Console, one-time setup):
//   1. Create a project (or reuse one) at console.cloud.google.com.
//   2. Enable the "Google Calendar API" for it.
//   3. Configure the OAuth consent screen (External, Testing mode is
//      fine for a small team - add the authorizing account under
//      "Test users").
//   4. Create an OAuth client ID of type "Desktop app". Copy its
//      Client ID and Client Secret.
//
// Usage:
//   node scripts/get-google-refresh-token.mjs <CLIENT_ID> <CLIENT_SECRET>
//
// It prints a URL - open it, sign in, approve access, then you're
// redirected to a localhost URL that will fail to load (expected,
// nothing is listening there) - copy the `code` query parameter value
// from that URL's address bar and paste it back into this script when
// prompted. It then prints the refresh token to save as
// GOOGLE_REFRESH_TOKEN (alongside GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)
// in the create-google-meet function's secrets.

import { createInterface } from 'node:readline/promises';

const [clientId, clientSecret] = process.argv.slice(2);
if (!clientId || !clientSecret) {
  console.error('Usage: node scripts/get-google-refresh-token.mjs <CLIENT_ID> <CLIENT_SECRET>');
  process.exit(1);
}

const REDIRECT_URI = 'http://localhost:53682';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
  client_id: clientId,
  redirect_uri: REDIRECT_URI,
  response_type: 'code',
  scope: SCOPE,
  access_type: 'offline',
  prompt: 'consent'
})}`;

console.log('\n1. Open this URL in a browser and approve access:\n');
console.log(authUrl);
console.log('\n2. You will land on a page that fails to load at localhost - that is expected.');
console.log('   Copy the value of the "code" parameter from that page\'s URL.\n');

const rl = createInterface({ input: process.stdin, output: process.stdout });
const code = (await rl.question('Paste the code here: ')).trim();
rl.close();

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI
  })
});
const tokenBody = await tokenRes.json();

if (!tokenRes.ok) {
  console.error('\nToken exchange failed:', tokenBody.error_description || tokenBody.error || tokenBody);
  process.exit(1);
}
if (!tokenBody.refresh_token) {
  console.error('\nNo refresh_token in the response - this usually means the account already');
  console.error('authorized this client before. Revoke access at https://myaccount.google.com/permissions');
  console.error('for this app, then run this script again.');
  process.exit(1);
}

console.log('\nSuccess. Save these as the create-google-meet function\'s secrets:\n');
console.log(`GOOGLE_CLIENT_ID=${clientId}`);
console.log(`GOOGLE_CLIENT_SECRET=${clientSecret}`);
console.log(`GOOGLE_REFRESH_TOKEN=${tokenBody.refresh_token}`);
