// Shared helpers for E2E specs. Credentials come from environment variables
// so no real password ever lives in the repo — see tests/README.md for setup.
export const TEST_MEMBER = {
  username: process.env.E2E_MEMBER_USERNAME || '',
  password: process.env.E2E_MEMBER_PASSWORD || ''
};

export const TEST_ADMIN = {
  username: process.env.E2E_ADMIN_USERNAME || '',
  password: process.env.E2E_ADMIN_PASSWORD || ''
};

export function requireTestAccounts() {
  if (!TEST_MEMBER.username || !TEST_MEMBER.password || !TEST_ADMIN.username || !TEST_ADMIN.password) {
    throw new Error(
      'Missing E2E test credentials. Copy .env.test.example to .env.test and fill in ' +
      'E2E_MEMBER_USERNAME/PASSWORD and E2E_ADMIN_USERNAME/PASSWORD for dedicated test accounts. See tests/README.md.'
    );
  }
}

export async function loginFromLanding(page, role, { username, password }) {
  await page.goto('/');
  await page.getByText(role === 'admin' ? 'Admin' : 'Member', { exact: true }).first().click();
  const fieldsScope = page.locator('.landing-login-box.open');
  await fieldsScope.getByPlaceholder(/username/i).fill(username);
  await fieldsScope.getByPlaceholder('Password').fill(password);
  await fieldsScope.getByRole('button', { name: /sign in as/i }).click();
  await page.waitForSelector('#appLayout', { state: 'visible' });
}

export async function logout(page) {
  await page.getByText('sign out').click();
  await page.waitForSelector('#landingPanel', { state: 'visible' });
}

// RLS is a database-level guarantee, not just a UI gate — these two
// helpers let a test act as the logged-in user but bypass the app's own
// UI entirely, calling the Supabase REST API directly with that user's
// real access token. A UI test proves the button is hidden; this proves
// the server itself would refuse the write even if someone found another
// way to send the request (a modified client, a direct API call, etc.).
export const SUPABASE_URL = 'https://qpchsvngmvpswwwjqaza.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_qUcXd4zGPoeluQND5_WJpQ_7torE5Zr';

async function readAuthStorage(page) {
  return page.evaluate(async () => {
    const keys = Object.keys(window.localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (keys.length === 0) return null;
    const raw = window.localStorage.getItem(keys[0]);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });
}

export async function getAccessToken(page) {
  const parsed = await readAuthStorage(page);
  return parsed?.access_token || null;
}

// The logged-in user's own profile id (auth.uid()) - needed to construct
// a request body that would satisfy an owner-only RLS policy (e.g. to
// seed data "as" this user via a direct API call in a test).
export async function getCurrentUserId(page) {
  const parsed = await readAuthStorage(page);
  return parsed?.user?.id || null;
}

// Direct REST call as the given user, bypassing all app UI/JS.
export async function directApiCall(page, { method, path, body }) {
  const token = await getAccessToken(page);
  if (!token) throw new Error('No access token found in localStorage — is the user actually logged in?');
  return page.request.fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    data: body
  });
}
