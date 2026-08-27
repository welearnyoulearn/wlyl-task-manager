import { test, expect } from '@playwright/test';
import {
  TEST_ADMIN, TEST_MEMBER, TEST_TESTER, TEST_DEVELOPER,
  requireTestAccounts, requireRoleTestAccounts,
  loginFromLanding, logout, directApiCall
} from './helpers.js';

test.beforeAll(() => {
  requireTestAccounts();
  requireRoleTestAccounts();
});

// Drives a fresh ticket to Ready for QA. Assigned (dev side) to
// TEST_DEVELOPER, since Accept Task / status changes / Mark Ready for
// QA are all dev-gated actions - a tester-role assignee (TEST_TESTER)
// wouldn't see those buttons at all (confirmed by member-roles.spec.js),
// so using them as the dev assignee here would break this helper.
// qa_assignee (routed separately, below) is what actually targets the
// tester for this phase's feature.
async function readyForQaTicket(page, title) {
  await loginFromLanding(page, 'admin', TEST_ADMIN);
  await page.locator('#adminSidebar').getByText('Assign Task').click();
  await page.locator('#taskAssignee').selectOption({ label: TEST_DEVELOPER.username });
  await page.locator('#panel-assigntask input[placeholder*="staging environment"]').fill(title);
  // Due date is required (Phase 5 follow-up) - fill it before opening the confirm dialog.
  await page.locator('#panel-assigntask input[type="date"]').fill('2026-12-31');
  // Assigning now opens a confirmation Dialog before the actual insert
  // (Step 6, item 13, Phase 5).
  await page.getByRole('button', { name: 'Assign Task' }).click();
  await page.getByRole('button', { name: 'Confirm & Assign' }).click();
  await expect(page.locator('#assignTaskStatus')).toContainText('assigned to');
  await logout(page);

  await loginFromLanding(page, 'member', TEST_DEVELOPER);
  await page.locator('#tabBar').getByText('My Tasks').click();
  const card = page.locator('#myTasksList .entry-card', { hasText: title });
  await card.getByRole('button', { name: 'Accept Task' }).click();
  await card.locator('select').selectOption('Done');
  // Mark Ready for QA now opens a mandatory test-plan Dialog before it
  // actually flips qa_status (Phase 5 follow-up) - portal-rendered, not
  // inside `card`.
  await card.getByRole('button', { name: 'Mark Ready for QA' }).click();
  const testPlanDialog = page.getByRole('dialog');
  await testPlanDialog.locator('textarea').fill('Verify the happy path and one edge case.');
  await testPlanDialog.getByRole('button', { name: 'Submit & Mark Ready for QA' }).click();
  await expect(card.getByText('QA: Ready for QA')).toBeVisible();
  await logout(page);
}

test.describe('QA assignment', () => {
  test('admin assigns QA to a specific tester: that tester can Start QA, a different qualified tester cannot', async ({ page }) => {
    const title = `QA assign E2E ${Date.now()}`;
    await readyForQaTicket(page, title);

    // Admin routes this ticket to TEST_TESTER specifically via Assign QA.
    // qa_assignee is independent of the dev assignee field - routing to
    // the same person who happens to already be the dev assignee is
    // fine here, it's just proving the routing mechanism itself.
    await loginFromLanding(page, 'admin', TEST_ADMIN);
    await page.locator('#adminSidebar').getByText('Tasks Board').click();
    const boardCard = page.locator('#tasksBoardList .entry-card', { hasText: title });
    await expect(boardCard).toBeVisible();
    await boardCard.getByRole('button', { name: 'Assign QA (required)' }).click();
    await boardCard.locator('select').filter({ hasText: 'choose a tester' }).selectOption({ label: TEST_TESTER.username });
    await expect(boardCard.getByText(`QA: ${TEST_TESTER.username}`)).toBeVisible();
    await logout(page);

    // The assigned tester CAN start QA (UI + it actually takes effect).
    await loginFromLanding(page, 'member', TEST_TESTER);
    await page.locator('#tabBar').getByText('My Tasks').click();
    const testerCard = page.locator('#myTasksList .entry-card', { hasText: title });
    await expect(testerCard.getByRole('button', { name: 'Start QA' })).toBeVisible();
    await testerCard.getByRole('button', { name: 'Start QA' }).click();
    await expect(testerCard.getByText('QA: In QA')).toBeVisible();

    // Find the task id for the negative-path API check below, while
    // still logged in as the (qualified) assignee, before switching users.
    const taskRes = await directApiCall(page, {
      method: 'GET',
      path: `tasks?select=id,qa_status,qa_assignee&title=eq.${encodeURIComponent(title)}`
    });
    const [task] = await taskRes.json();
    expect(task).toBeTruthy();
    expect(task.qa_status).toBe('In QA');
    expect(task.qa_assignee).toBeTruthy();
    await logout(page);

    // TEST_MEMBER (narendra) has member_role='both', so they're a
    // genuinely qualified tester in general - but NOT the specific
    // person qa_assignee was routed to on this ticket, so
    // tasks_update_qa's routing check should reject any write from
    // them. They have no UI path to this ticket at all (not the dev
    // assignee, not qa_assignee, and there's no ticket-search/URL
    // routing in this app), so this is necessarily a direct-API check,
    // not a UI one - which is itself part of what "cannot" means here:
    // there's no button for them to see in the first place.
    // RLS's USING clause on UPDATE, when it excludes a row, doesn't
    // error - PostgREST just returns 200 (or 204, depending on the
    // Prefer header) with zero rows affected. Checking the HTTP status
    // alone is NOT enough (a 200 here is otherwise indistinguishable
    // from a successful single-row update) - the actual proof is either
    // an empty representation array, or a non-2xx error status.
    await loginFromLanding(page, 'member', TEST_MEMBER);
    const writeRes = await directApiCall(page, {
      method: 'PATCH',
      path: `tasks?id=eq.${task.id}`,
      body: { qa_status: 'Passed' }
    });
    if (writeRes.ok()) {
      const body = writeRes.status() === 204 ? [] : await writeRes.json();
      expect(body.length).toBe(0);
    } // else: a non-2xx (e.g. trigger exception) is itself proof of rejection.

    const verifyRes = await directApiCall(page, {
      method: 'GET',
      path: `tasks?select=qa_status&id=eq.${task.id}`
    });
    const [verified] = await verifyRes.json();
    expect(verified.qa_status).toBe('In QA'); // unchanged
    await logout(page);
  });

  test('admin leaves qa_assignee unset: Start QA is blocked for everyone, including a fully qualified self-assignee', async ({ page }) => {
    // QA assignment is now mandatory (self-pick removed) - a ticket
    // sitting at Ready for QA with qa_assignee still null cannot be
    // started by anyone, not even TEST_MEMBER (narendra, member_role=
    // 'both', who is also the ticket's own dev assignee and would have
    // been allowed to self-pick before this change). UI check: no Start
    // QA button at all, plus a visible "QA: unassigned" flag. Negative-
    // path API check backs this up at the database level too.
    const title = `QA unassigned E2E ${Date.now()}`;

    await loginFromLanding(page, 'admin', TEST_ADMIN);
    await page.locator('#adminSidebar').getByText('Assign Task').click();
    await page.locator('#taskAssignee').selectOption({ label: TEST_MEMBER.username });
    await page.locator('#panel-assigntask input[placeholder*="staging environment"]').fill(title);
    await page.locator('#panel-assigntask input[type="date"]').fill('2026-12-31');
    await page.getByRole('button', { name: 'Assign Task' }).click();
    await page.getByRole('button', { name: 'Confirm & Assign' }).click();
    await expect(page.locator('#assignTaskStatus')).toContainText('assigned to');
    await logout(page);

    await loginFromLanding(page, 'member', TEST_MEMBER);
    await page.locator('#tabBar').getByText('My Tasks').click();
    const card = page.locator('#myTasksList .entry-card', { hasText: title });
    await card.getByRole('button', { name: 'Accept Task' }).click();
    await card.locator('select').selectOption('Done');
    await card.getByRole('button', { name: 'Mark Ready for QA' }).click();
    const testPlanDialog = page.getByRole('dialog');
    await testPlanDialog.locator('textarea').fill('Verify the happy path and one edge case.');
    await testPlanDialog.getByRole('button', { name: 'Submit & Mark Ready for QA' }).click();
    await expect(card.getByText('QA: Ready for QA')).toBeVisible();
    await expect(card.getByText('QA: unassigned')).toBeVisible();

    // No Assign QA action taken - qa_assignee stays null. Start QA must
    // not be offered to anyone, including this fully-qualified
    // ('both'-role) dev assignee.
    await expect(card.getByRole('button', { name: 'Start QA' })).toHaveCount(0);

    const taskRes = await directApiCall(page, {
      method: 'GET',
      path: `tasks?select=id,qa_status,qa_assignee&title=eq.${encodeURIComponent(title)}`
    });
    const [task] = await taskRes.json();
    expect(task).toBeTruthy();
    expect(task.qa_assignee).toBeFalsy();

    const writeRes = await directApiCall(page, {
      method: 'PATCH',
      path: `tasks?id=eq.${task.id}`,
      body: { qa_status: 'In QA' }
    });
    if (writeRes.ok()) {
      const body = writeRes.status() === 204 ? [] : await writeRes.json();
      expect(body.length).toBe(0);
    } // else: a non-2xx (trigger exception "not assigned to a tester yet") is itself proof of rejection.

    const verifyRes = await directApiCall(page, {
      method: 'GET',
      path: `tasks?select=qa_status&id=eq.${task.id}`
    });
    const [verified] = await verifyRes.json();
    expect(verified.qa_status).toBe('Ready for QA'); // unchanged
    await logout(page);
  });
});
