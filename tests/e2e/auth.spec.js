import { test, expect } from '@playwright/test';
import { TEST_MEMBER, TEST_ADMIN, requireTestAccounts, loginFromLanding, logout } from './helpers.js';

test.beforeAll(requireTestAccounts);

test.describe('Login', () => {
  test('member can sign in from the landing page', async ({ page }) => {
    await loginFromLanding(page, 'member', TEST_MEMBER);
    await expect(page.locator('#appLayout')).toBeVisible();
    await expect(page.locator('#adminSidebar')).toBeHidden();
    await expect(page.locator('#authCorner').getByText(TEST_MEMBER.username, { exact: false })).toBeVisible();
    await logout(page);
  });

  test('admin can sign in from the landing page and sees the admin sidebar', async ({ page }) => {
    await loginFromLanding(page, 'admin', TEST_ADMIN);
    await expect(page.locator('#appLayout')).toBeVisible();
    await expect(page.locator('#adminSidebar')).toBeVisible();
    await expect(page.locator('#authCorner').getByText(`${TEST_ADMIN.username} (admin)`)).toBeVisible();
    await logout(page);
  });

  test('a member account cannot sign in through the Admin box', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Admin', { exact: true }).first().click();
    const fieldsScope = page.locator('.landing-login-box.open');
    await fieldsScope.getByPlaceholder(/admin username/i).fill(TEST_MEMBER.username);
    await fieldsScope.getByPlaceholder('Password').fill(TEST_MEMBER.password);
    await fieldsScope.getByRole('button', { name: /sign in as admin/i }).click();
    await expect(fieldsScope.getByText('That account is not an admin.')).toBeVisible();
    await expect(page.locator('#appLayout')).toBeHidden();
  });
});
