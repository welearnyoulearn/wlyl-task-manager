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
