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
  // Due date is required (Phase 5 follow-up) - fill it before opening the confirm dialog.
  await page.locator('#panel-assigntask input[type="date"]').fill('2026-12-31');
  // Assigning now opens a confirmation Dialog before the actual insert
  // (Step 6, item 13, Phase 5).
  await page.getByRole('button', { name: 'Assign Task' }).click();
  await page.getByRole('button', { name: 'Confirm & Assign' }).click();
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

// Mark Ready for QA now opens a mandatory test-plan Dialog before it
// actually flips qa_status - the dev must provide a test plan in the
// same request (Phase 5 follow-up). Portal-rendered, not inside `card`.
async function markReadyForQaWithTestPlan(page, card, testPlanText = 'Verify the happy path and one edge case.') {
  await card.getByRole('button', { name: 'Mark Ready for QA' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('textarea').fill(testPlanText);
  await dialog.getByRole('button', { name: 'Submit & Mark Ready for QA' }).click();
}

// QA assignment is now mandatory (013_mandatory_qa_assignment.sql) -
// Start QA doesn't appear at all until an admin explicitly assigns a
// tester via Tasks Board. These tests use TEST_MEMBER (member_role=
// 'both') as both the dev assignee and the tester, so this just routes
// the ticket back to themselves - proving the assignment mechanism
// works, not proving self-pick still exists (it doesn't).
async function adminAssignsQaToSelf(page, title) {
  // Caller may still be logged in as whoever drove the ticket to Ready
  // for QA - log out first so loginFromLanding's landing-page click
  // actually has a landing page to click on, instead of racing against
  // whatever page the caller left off on.
  await logout(page);
  await loginFromLanding(page, 'admin', TEST_ADMIN);
  await page.locator('#adminSidebar').getByText('Tasks Board').click();
  const boardCard = page.locator('#tasksBoardList .entry-card', { hasText: title });
  await boardCard.getByRole('button', { name: 'Assign QA (required)' }).click();
  await boardCard.locator('select').filter({ hasText: 'choose a tester' }).selectOption({ label: TEST_MEMBER.username });
  await expect(boardCard.getByText(`QA: ${TEST_MEMBER.username}`)).toBeVisible();
  await logout(page);
  await loginFromLanding(page, 'member', TEST_MEMBER);
  await page.locator('#tabBar').getByText('My Tasks').click();
}

test.describe('QA workflow', () => {
  test('dev marks a Done ticket as Ready for QA', async ({ page }) => {
    const title = `QA ready E2E ${Date.now()}`;
    const card = await assignAndCompleteTicket(page, title);

    await expect(card.getByText('QA: Not Ready')).toBeVisible();
    await markReadyForQaWithTestPlan(page, card);
    await expect(card.getByText('QA: Ready for QA')).toBeVisible();
    await expect(card.getByText('Test plan')).toBeVisible();

    await logout(page);
  });

  test('member starts QA, fails it with a bug report, ticket shows Failed and the bug report appears', async ({ page }) => {
    const title = `QA fail E2E ${Date.now()}`;
    let card = await assignAndCompleteTicket(page, title);
    await markReadyForQaWithTestPlan(page, card);
    await expect(card.getByText('QA: Ready for QA')).toBeVisible();

    await adminAssignsQaToSelf(page, title);
    card = page.locator('#myTasksList .entry-card', { hasText: title });
    await card.getByRole('button', { name: 'Start QA' }).click();
    await expect(card.getByText('QA: In QA')).toBeVisible();

    // Fail QA now opens the bug report form as a Dialog (Step 6, item 12,
    // Phase 5) - it renders in a portal, not inside `card`, so look it up
    // via its dialog role instead of scoping to the card.
    await card.getByRole('button', { name: 'Fail QA' }).click();
    const bugForm = page.getByRole('dialog');
    const textareas = bugForm.locator('textarea');
    await textareas.nth(0).fill('1. Open the page\n2. Click submit'); // Steps to reproduce
    await textareas.nth(1).fill('Form submits successfully'); // Expected behavior
    await textareas.nth(2).fill('Form throws a 500 error'); // Actual behavior
    await bugForm.locator('select').selectOption('Major'); // Severity
    await bugForm.getByPlaceholder('Chrome, desktop, preview URL').fill('Chrome, desktop, E2E');
    await bugForm.getByRole('button', { name: 'Submit and Fail QA' }).click();

    await expect(card.getByText('QA: Failed')).toBeVisible();
    // Bug reports/test evidence are collapsed behind "Show details" by
    // default (declutter pass, Phase 5 follow-up) - expand before
    // checking for the bug report content.
    await card.getByRole('button', { name: /show details/i }).click();
    await expect(card.getByText('Form throws a 500 error')).toBeVisible();
    await expect(card.locator('.severity-tag')).toContainText('Major');

    await logout(page);
  });

  test('member starts QA, passes it, ticket shows Passed and status stays/advances to Done', async ({ page }) => {
    const title = `QA pass E2E ${Date.now()}`;
    let card = await assignAndCompleteTicket(page, title);
    await markReadyForQaWithTestPlan(page, card);
    await adminAssignsQaToSelf(page, title);
    card = page.locator('#myTasksList .entry-card', { hasText: title });
    await card.getByRole('button', { name: 'Start QA' }).click();
    await expect(card.getByText('QA: In QA')).toBeVisible();

    await card.getByRole('button', { name: 'Pass QA' }).click();
    await expect(card.getByText('QA: Passed')).toBeVisible();
    await expect(card.getByText('● Done')).toBeVisible();

    await logout(page);
  });

  test('marking a bug report resolved', async ({ page }) => {
    const title = `QA resolve E2E ${Date.now()}`;
    let card = await assignAndCompleteTicket(page, title);
    await markReadyForQaWithTestPlan(page, card);
    await adminAssignsQaToSelf(page, title);
    card = page.locator('#myTasksList .entry-card', { hasText: title });
    await card.getByRole('button', { name: 'Start QA' }).click();
    await card.getByRole('button', { name: 'Fail QA' }).click();
    const bugForm = page.getByRole('dialog');
    const textareas = bugForm.locator('textarea');
    await textareas.nth(0).fill('Repro steps');
    await textareas.nth(1).fill('Expected');
    await textareas.nth(2).fill('Actual');
    await bugForm.getByRole('button', { name: 'Submit and Fail QA' }).click();

    // Bug reports/test evidence are collapsed behind "Show details" by
    // default - expand before checking for the bug report.
    await card.getByRole('button', { name: /show details/i }).click();
    await expect(card.getByText('Open bug reports')).toBeVisible();

    await card.getByRole('button', { name: 'Mark Resolved' }).click();
    await expect(card.getByText('Resolved bug reports')).toBeVisible();

    await logout(page);
  });
});
