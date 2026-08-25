import { test, expect } from '@playwright/test';
import { TEST_MEMBER, TEST_ADMIN, requireTestAccounts, loginFromLanding, logout } from './helpers.js';

test.beforeAll(requireTestAccounts);

test.describe('Comments', () => {
  test('member can post a comment on a ticket', async ({ page }) => {
    await loginFromLanding(page, 'member', TEST_MEMBER);
    await page.locator('#tabBar').getByText('My Tasks').click();

    const card = page.locator('#myTasksList .entry-card').first();
    test.skip((await card.count()) === 0, 'Member has no tasks — run task-assignment.spec.js first.');

    const commentText = `Ticket comment E2E ${Date.now()}`;
    await card.getByPlaceholder(/add a comment/i).fill(commentText);
    await card.getByRole('button', { name: 'Post' }).click();
    await expect(card).toContainText(commentText);

    await logout(page);
  });

  test('admin can post a comment directly on a weekly report', async ({ page }) => {
    await loginFromLanding(page, 'admin', TEST_ADMIN);
    await page.locator('#adminSidebar').getByText('All Updates').click();

    const card = page.locator('#historyEntries .entry-card').first();
    test.skip((await card.count()) === 0, 'No weekly reports exist yet — run weekly-update.spec.js first.');

    const commentText = `Report comment E2E ${Date.now()}`;
    await card.getByPlaceholder(/add a comment/i).fill(commentText);
    await card.getByRole('button', { name: 'Post' }).click();
    await expect(card).toContainText(commentText);

    await logout(page);
  });
});
