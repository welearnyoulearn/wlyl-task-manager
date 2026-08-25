import { test, expect } from '@playwright/test';
import { TEST_ADMIN, requireTestAccounts, loginFromLanding, logout } from './helpers.js';

test.beforeAll(requireTestAccounts);

// Note: the shared Ticket Detail view is reachable only by clicking the
// dedicated ticket-id spans the app renders (Tasks Board / My Tasks / By
// Person / the [WLYL-####] tag next to a linked report section) — there is
// no free-text scan for "WLYL-####" elsewhere in a report body. See NOTES.md.
test.describe('Ticket Detail navigation', () => {
  test('clicking a ticket id on the Tasks Board opens Ticket Detail and remembers the return tab', async ({ page }) => {
    await loginFromLanding(page, 'admin', TEST_ADMIN);
    await page.locator('#adminSidebar').getByText('Tasks Board').click();

    const firstCard = page.locator('#tasksBoardList .entry-card').first();
    test.skip((await firstCard.count()) === 0, 'No tickets exist yet — run task-assignment.spec.js first.');

    const ticketLink = firstCard.locator('.ticket-link').first();
    const ticketId = (await ticketLink.textContent()).trim();
    await ticketLink.click();

    await expect(page.locator('#panel-ticketdetail')).toBeVisible();
    await expect(page.locator('#ticketDetailContent')).toContainText(ticketId);

    await page.getByRole('button', { name: /back/i }).click();
    await expect(page.locator('#panel-tasksboard')).toBeVisible();

    await logout(page);
  });
});
