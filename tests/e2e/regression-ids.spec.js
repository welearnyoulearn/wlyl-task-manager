import { test, expect } from '@playwright/test';
import { TEST_ADMIN, requireTestAccounts, loginFromLanding } from './helpers.js';

// Regression coverage for DOM ids that existed in the original vanilla-JS
// app and were silently dropped during the Phase 1 React migration. Two
// of these (AssignTaskPanel, TasksBoardPanel) caused real test/functional
// failures and were already fixed and covered by their own specs. This
// file covers the ones found in the systematic dropped-ids audit that
// don't naturally belong in a feature-flow spec: pure styling hooks and
// focus-management behavior, both checked directly against the DOM/CSS
// rather than through a full user flow.
//
// These don't require login, since the landing page + corner button are
// visible to anyone.

test.describe('Regression: dropped ids restored in the dropped-ids-cleanup pass', () => {
  test('#adminBox and #memberBox ids exist and receive their distinct icon styling', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Member', { exact: true }).first().click();
    await expect(page.locator('#memberBox')).toBeVisible();

    await page.getByText('Admin', { exact: true }).first().click();
    await expect(page.locator('#adminBox')).toBeVisible();

    // styles.css has an #adminBox-specific rule tinting its icon amber
    // (rgba(232,163,61,...) / #b57519); #memberBox has no such override
    // and keeps the default teal accent color. Before the ids were
    // restored, both icons silently rendered identically (teal) because
    // #adminBox .landing-login-box-icon never matched anything.
    const adminIconColor = await page.locator('#adminBox .landing-login-box-icon').evaluate(el => getComputedStyle(el).color);
    const memberIconColor = await page.locator('#memberBox .landing-login-box-icon').evaluate(el => getComputedStyle(el).color);
    expect(adminIconColor).toBe('rgb(181, 117, 25)'); // #b57519
    expect(adminIconColor).not.toBe(memberIconColor);
  });

  test('opening the Member login box moves focus to its username field', async ({ page }) => {
    // Original vanilla JS explicitly called .focus() on the username
    // input after toggleLandingBox() opened a box. The React port
    // replaced the id-based lookup with `autoFocus` on mount - this test
    // exists to catch a regression if that autoFocus prop is ever
    // dropped, since the original id (`memberBoxUsername`) is gone and
    // won't itself flag the loss.
    await page.goto('/');
    await page.getByText('Member', { exact: true }).first().click();
    const usernameInput = page.locator('#memberBox').getByPlaceholder('Enter your username');
    await expect(usernameInput).toBeFocused();
  });

  test('opening a password-change row moves focus to the new-password field', async ({ page }) => {
    // Same focus-management regression risk as above, for
    // PasswordChangeCell.jsx (originally pwInput_${safeId}.focus() in
    // state.js). Exercised here against the Manage Members table since
    // it doesn't require creating any data - just an admin login.
    requireTestAccounts();
    await loginFromLanding(page, 'admin', TEST_ADMIN);
    await page.locator('#adminSidebar').getByText('Manage Members').click();

    const row = page.locator('#memberListBody tr').first();
    test.skip((await row.count()) === 0, 'No members exist to exercise a password-change row.');
    await row.getByRole('button', { name: 'change password' }).click();
    await expect(row.getByPlaceholder('New password')).toBeFocused();
  });
});
