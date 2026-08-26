import { test, expect } from '@playwright/test';
import { TEST_MEMBER, TEST_ADMIN, requireTestAccounts, loginFromLanding, logout } from './helpers.js';

test.beforeAll(requireTestAccounts);

test.describe('Task assignment and lifecycle', () => {
  test('admin assigns a task, member accepts it and changes status', async ({ page }) => {
    const title = `E2E task ${Date.now()}`;

    // --- Admin assigns the task ---
    await loginFromLanding(page, 'admin', TEST_ADMIN);
    await page.locator('#adminSidebar').getByText('Assign Task').click();
    await page.locator('#taskAssignee').selectOption({ label: TEST_MEMBER.username });
    await page.locator('#panel-assigntask input[placeholder*="staging environment"]').fill(title);
    // Assigning now opens a confirmation Dialog before the actual insert
    // (Step 6, item 13, Phase 5) - "Assign Task" opens it, "Confirm &
    // Assign" inside the dialog does the write.
    await page.getByRole('button', { name: 'Assign Task' }).click();
    await page.getByRole('button', { name: 'Confirm & Assign' }).click();
    await expect(page.locator('#assignTaskStatus')).toContainText('assigned to');
    const ticketMatch = await page.locator('#assignTaskStatus').textContent();
    const ticketId = ticketMatch.match(/WLYL-\d+/)?.[0];
    expect(ticketId).toBeTruthy();
    await logout(page);

    // --- Member sees it under "My Tasks", must accept before status changes ---
    await loginFromLanding(page, 'member', TEST_MEMBER);
    await page.locator('#tabBar').getByText('My Tasks').click();
    const card = page.locator('#myTasksList .entry-card', { hasText: title });
    await expect(card).toBeVisible();
    await expect(card.getByText('● Assigned')).toBeVisible();
    await expect(card.locator('select')).toHaveCount(0); // gated: no status dropdown before accept

    await card.getByRole('button', { name: 'Accept Task' }).click();
    await expect(card.getByText('● Not Started')).toBeVisible();
    await expect(card.locator('select')).toHaveCount(1); // status dropdown now available

    await card.locator('select').selectOption('In Progress');
    await expect(card.getByText('● In Progress')).toBeVisible();

    await logout(page);
  });
});
