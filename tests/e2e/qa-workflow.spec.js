import { test, expect } from '@playwright/test';
import { TEST_MEMBER, TEST_ADMIN, requireTestAccounts, loginFromLanding, logout } from './helpers.js';

test.beforeAll(requireTestAccounts);

// Drives a fresh ticket from Assigned -> Done, then exercises the QA
// workflow layer on top of it. Split into two independent tickets (one
// driven to Passed, one to Failed) so the two terminal outcomes don't
// collide on the same row.
async function assignAndCompleteTicket(page, title) {
  await loginFromLanding(page, 'admin', TEST_ADMIN);
  await page.locator('#adminSidebar').getByText('Assign Task').click();
  await page.locator('#taskAssignee').selectOption({ label: TEST_MEMBER.username });
  await page.locator('#panel-assigntask input[placeholder*="staging environment"]').fill(title);
  await page.getByRole('button', { name: 'Assign Task' }).click();
  await expect(page.locator('#assignTaskStatus')).toContainText('assigned to');
  await logout(page);

  await loginFromLanding(page, 'member', TEST_MEMBER);
  await page.locator('#tabBar').getByText('My Tasks').click();
  const card = page.locator('#myTasksList .entry-card', { hasText: title });
  await card.getByRole('button', { name: 'Accept Task' }).click();
  await card.locator('select').selectOption('Done');
  await expect(card.getByText('● Done')).toBeVisible();
  return card;
}

test.describe('QA workflow', () => {
  test('dev marks a Done ticket as Ready for QA', async ({ page }) => {
    const title = `QA ready E2E ${Date.now()}`;
    const card = await assignAndCompleteTicket(page, title);

    await expect(card.getByText('QA: Not Ready')).toBeVisible();
    await card.getByRole('button', { name: 'Mark Ready for QA' }).click();
    await expect(card.getByText('QA: Ready for QA')).toBeVisible();

    await logout(page);
  });

  test('member starts QA, fails it with a bug report, ticket shows Failed and the bug report appears', async ({ page }) => {
    const title = `QA fail E2E ${Date.now()}`;
    const card = await assignAndCompleteTicket(page, title);
    await card.getByRole('button', { name: 'Mark Ready for QA' }).click();
    await expect(card.getByText('QA: Ready for QA')).toBeVisible();

    await card.getByRole('button', { name: 'Start QA' }).click();
    await expect(card.getByText('QA: In QA')).toBeVisible();

    await card.getByRole('button', { name: 'Fail QA' }).click();
    const bugForm = card.locator('.entry-block.blocked').last();
    const textareas = bugForm.locator('textarea');
    await textareas.nth(0).fill('1. Open the page\n2. Click submit'); // Steps to reproduce
    await textareas.nth(1).fill('Form submits successfully'); // Expected behavior
    await textareas.nth(2).fill('Form throws a 500 error'); // Actual behavior
    await bugForm.locator('select').selectOption('Major'); // Severity
    await bugForm.getByPlaceholder('Chrome, desktop, preview URL').fill('Chrome, desktop, E2E');
    await card.getByRole('button', { name: 'Submit and Fail QA' }).click();

    await expect(card.getByText('QA: Failed')).toBeVisible();
    await expect(card.getByText('Form throws a 500 error')).toBeVisible();
    await expect(card.locator('.severity-tag')).toContainText('Major');

    await logout(page);
  });

  test('member starts QA, passes it, ticket shows Passed and status stays/advances to Done', async ({ page }) => {
    const title = `QA pass E2E ${Date.now()}`;
    const card = await assignAndCompleteTicket(page, title);
    await card.getByRole('button', { name: 'Mark Ready for QA' }).click();
    await card.getByRole('button', { name: 'Start QA' }).click();
    await expect(card.getByText('QA: In QA')).toBeVisible();

    await card.getByRole('button', { name: 'Pass QA' }).click();
    await expect(card.getByText('QA: Passed')).toBeVisible();
    await expect(card.getByText('● Done')).toBeVisible();

    await logout(page);
  });

  test('attaching test evidence renders it on the ticket', async ({ page }) => {
    const title = `QA evidence E2E ${Date.now()}`;
    const card = await assignAndCompleteTicket(page, title);

    await card.getByRole('button', { name: 'Attach Test Run' }).click();
    await card.getByPlaceholder(/actions\/runs/).fill('https://github.com/example/repo/actions/runs/123');
    const numberInputs = card.locator('input[type="number"]');
    await numberInputs.nth(0).fill('12');
    await numberInputs.nth(1).fill('0');
    await card.getByRole('button', { name: 'Attach' }).click();

    await expect(card.getByText('12/12 passed')).toBeVisible();
    await expect(card.getByRole('link', { name: 'run' })).toHaveAttribute('href', 'https://github.com/example/repo/actions/runs/123');

    await logout(page);
  });

  test('marking a bug report resolved', async ({ page }) => {
    const title = `QA resolve E2E ${Date.now()}`;
    const card = await assignAndCompleteTicket(page, title);
    await card.getByRole('button', { name: 'Mark Ready for QA' }).click();
    await card.getByRole('button', { name: 'Start QA' }).click();
    await card.getByRole('button', { name: 'Fail QA' }).click();
    const bugForm = card.locator('.entry-block.blocked').last();
    const textareas = bugForm.locator('textarea');
    await textareas.nth(0).fill('Repro steps');
    await textareas.nth(1).fill('Expected');
    await textareas.nth(2).fill('Actual');
    await card.getByRole('button', { name: 'Submit and Fail QA' }).click();
    await expect(card.getByText('Open bug reports')).toBeVisible();

    await card.getByRole('button', { name: 'Mark Resolved' }).click();
    await expect(card.getByText('Resolved bug reports')).toBeVisible();

    await logout(page);
  });
});
