import { test, expect } from '@playwright/test';
import { TEST_MEMBER, requireTestAccounts, loginFromLanding, logout } from './helpers.js';

test.beforeAll(requireTestAccounts);

test.describe('Weekly update submission', () => {
  test('member submits an update without a linked ticket', async ({ page }) => {
    await loginFromLanding(page, 'member', TEST_MEMBER);

    const completedText = `Completed E2E item ${Date.now()}`;
    await page.locator('#panel-submit textarea').first().fill(completedText);
    await page.getByRole('button', { name: 'Submit Update' }).click();
    await expect(page.locator('#panel-submit .status')).toContainText('Submitted');

    await page.locator('#tabBar').getByText('My History').click();
    await expect(page.locator('#mineEntries')).toContainText(completedText);

    await logout(page);
  });

  test('member submits an update with a linked ticket on the Completed section', async ({ page }) => {
    await loginFromLanding(page, 'member', TEST_MEMBER);

    const select = page.locator('#panel-submit select').first();
    const optionCount = await select.locator('option').count();
    test.skip(optionCount <= 1, 'Member has no accepted tickets to link — run task-assignment.spec.js first.');

    const completedText = `Completed with ticket E2E ${Date.now()}`;
    await page.locator('#panel-submit textarea').first().fill(completedText);
    await select.selectOption({ index: 1 });
    const chosenTicketId = await select.inputValue();

    await page.getByRole('button', { name: 'Submit Update' }).click();
    await expect(page.locator('#panel-submit .status')).toContainText('Submitted');

    await page.locator('#tabBar').getByText('My History').click();
    const entry = page.locator('#mineEntries .entry-card', { hasText: completedText });
    await expect(entry.getByText(`[${chosenTicketId}]`)).toBeVisible();

    await logout(page);
  });

  test('resubmitting the same week upserts instead of duplicating', async ({ page }) => {
    await loginFromLanding(page, 'member', TEST_MEMBER);

    const firstText = `Upsert check A ${Date.now()}`;
    await page.locator('#panel-submit textarea').first().fill(firstText);
    await page.getByRole('button', { name: 'Submit Update' }).click();
    await expect(page.locator('#panel-submit .status')).toContainText('Submitted');

    const secondText = `Upsert check B ${Date.now()}`;
    await page.locator('#panel-submit textarea').first().fill(secondText);
    await page.getByRole('button', { name: 'Submit Update' }).click();
    await expect(page.locator('#panel-submit .status')).toContainText('Submitted');

    await page.locator('#tabBar').getByText('My History').click();
    await expect(page.locator('#mineEntries')).toContainText(secondText);
    await expect(page.locator('#mineEntries')).not.toContainText(firstText);

    await logout(page);
  });
});
