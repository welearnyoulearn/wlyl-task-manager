import { test, expect } from '@playwright/test';
import { TEST_ADMIN, requireTestAccounts, loginFromLanding, logout } from './helpers.js';

test.beforeAll(requireTestAccounts);

test.describe('Admin Tasks Board', () => {
  test('admin can view Tasks Board and filter by status', async ({ page }) => {
    await loginFromLanding(page, 'admin', TEST_ADMIN);
    await page.locator('#adminSidebar').getByText('Tasks Board').click();
    await expect(page.locator('#panel-tasksboard')).toBeVisible();
    await expect(page.locator('#taskSummaryRow .summary-card')).toHaveCount(6);

    const totalBefore = await page.locator('#taskSummaryRow .summary-card').first().locator('.num-big').textContent();
    expect(Number(totalBefore)).toBeGreaterThanOrEqual(0);

    await page.locator('#panel-tasksboard select').nth(1).selectOption('Done');
    // Every visible status badge should now read "Done" (or the list is empty).
    const badges = page.locator('#tasksBoardList .entry-card span', { hasText: '●' });
    const count = await badges.count();
    for (let i = 0; i < count; i++) {
      await expect(badges.nth(i)).toContainText('Done');
    }

    await logout(page);
  });
});
