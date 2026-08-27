import { test, expect } from '@playwright/test';
import { TEST_MEMBER, requireTestAccounts, loginFromLanding, logout } from './helpers.js';

test.beforeAll(requireTestAccounts);

// Submit Update and Weekly Summary are two independent tabs/save paths
// (Phase 5 follow-up, after the initial Part A build): Submit Update
// shows auto-detected ticket activity with a per-ticket note + Post
// button that saves immediately, one ticket at a time; Weekly Summary
// covers Hours/Learned/Blocked/Next Week with its own confirm-then-submit
// flow, entirely independent of ticket notes.
test.describe('Weekly Summary submission', () => {
  test('member submits a weekly summary with no narrative text (minimal submission)', async ({ page }) => {
    await loginFromLanding(page, 'member', TEST_MEMBER);
    await page.locator('#tabBar').getByText('Weekly Summary').click();

    const nextWeekText = `Next week E2E item ${Date.now()}`;
    await page.locator('#panel-summary textarea').nth(2).fill(nextWeekText); // Learned, Blocked, Next week
    await page.getByRole('button', { name: 'Submit Update' }).click();
    await page.getByRole('button', { name: 'Confirm & Submit' }).click();
    await expect(page.locator('#panel-summary .status')).toContainText('Submitted');

    await page.locator('#tabBar').getByText('My History').click();
    await expect(page.locator('#mineEntries')).toContainText(nextWeekText);

    await logout(page);
  });

  test('resubmitting the same week upserts instead of duplicating', async ({ page }) => {
    await loginFromLanding(page, 'member', TEST_MEMBER);
    await page.locator('#tabBar').getByText('Weekly Summary').click();

    const firstText = `Upsert check A ${Date.now()}`;
    await page.locator('#panel-summary textarea').nth(2).fill(firstText);
    await page.getByRole('button', { name: 'Submit Update' }).click();
    await page.getByRole('button', { name: 'Confirm & Submit' }).click();
    await expect(page.locator('#panel-summary .status')).toContainText('Submitted');

    const secondText = `Upsert check B ${Date.now()}`;
    await page.locator('#panel-summary textarea').nth(2).fill(secondText);
    await page.getByRole('button', { name: 'Submit Update' }).click();
    await page.getByRole('button', { name: 'Confirm & Submit' }).click();
    await expect(page.locator('#panel-summary .status')).toContainText('Submitted');

    await page.locator('#tabBar').getByText('My History').click();
    await expect(page.locator('#mineEntries')).toContainText(secondText);
    await expect(page.locator('#mineEntries')).not.toContainText(firstText);

    await logout(page);
  });
});

test.describe('Submit Update: per-ticket activity notes', () => {
  test('zero ticket activity shows the "no activity" state, not a blank gap', async ({ page }) => {
    await loginFromLanding(page, 'member', TEST_MEMBER);
    // My Tasks is the default landing tab (Phase 5 follow-up), not Submit
    // Update - navigate there explicitly.
    await page.locator('#tabBar').getByText('Submit Update').click();
    // A week far in the past should have no ticket activity for anyone.
    await page.locator('#panel-submit input[type="date"]').fill('2020-01-06');
    await expect(page.locator('#panel-submit').getByText('No ticket activity detected this week.')).toBeVisible();
    await logout(page);
  });

  test('posting a note on a detected ticket saves it immediately and shows a posted state', async ({ page }) => {
    await loginFromLanding(page, 'member', TEST_MEMBER);
    // My Tasks is the default landing tab (Phase 5 follow-up), not Submit
    // Update - navigate there explicitly.
    await page.locator('#tabBar').getByText('Submit Update').click();

    const firstTicketBlock = page.locator('#panel-submit .entry-block').first();
    test.skip((await firstTicketBlock.count()) === 0, 'Member has no detected ticket activity this week — run task-assignment.spec.js first.');

    const noteText = `Note E2E ${Date.now()}`;
    await firstTicketBlock.getByPlaceholder('Add a note (optional)').fill(noteText);
    await firstTicketBlock.getByRole('button', { name: 'Post' }).click();
    await expect(firstTicketBlock.getByRole('button', { name: /Posted/ })).toBeVisible();

    await page.locator('#tabBar').getByText('My History').click();
    const entry = page.locator('#mineEntries .entry-card').first();
    await expect(entry).toContainText(noteText);

    await logout(page);
  });
});
