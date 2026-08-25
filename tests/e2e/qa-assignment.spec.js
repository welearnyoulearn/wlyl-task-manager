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
  await page.getByRole('button', { name: 'Assign Task' }).click();
  await expect(page.locator('#assignTaskStatus')).toContainText('assigned to');
  await logout(page);

  await loginFromLanding(page, 'member', TEST_DEVELOPER);
  await page.locator('#tabBar').getByText('My Tasks').click();
  const card = page.locator('#myTasksList .entry-card', { hasText: title });
  await card.getByRole('button', { name: 'Accept Task' }).click();
  await card.locator('select').selectOption('Done');
  await card.getByRole('button', { name: 'Mark Ready for QA' }).click();
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
    await boardCard.getByRole('button', { name: 'Assign QA' }).click();
    await boardCard.locator('select').filter({ hasText: 'any qualified tester' }).selectOption({ label: TEST_TESTER.username });
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

  test('admin leaves qa_assignee unset: a qualified tester can still self-pick via Start QA (regression check)', async ({ page }) => {
    // Uses TEST_MEMBER (narendra, member_role='both') as BOTH the dev
    // assignee and the person self-picking QA - deliberately, not
    // TEST_TESTER. Discovered while writing this test: a tester-role
    // member has no UI path to ANY ticket they aren't already the dev
    // assignee on (My Tasks only shows your own dev assignments, Tasks
    // Board/By Person are admin-only, there's no ticket search or URL
    // routing - see NOTES.md). So "any qualified tester can self-pick"
    // was always, in practice, "the ticket's own assignee, if also
    // tester-qualified, can self-pick" - qa_assignee doesn't change
    // that reachability, it only narrows who's ALLOWED to act once they
    // can already see the ticket. A 'both'-role assignee is the
    // realistic case this regression check can actually exercise
    // through the UI; a 'tester'-only non-assignee genuinely cannot
    // reach this ticket at all today, assigned or not.
    const title = `QA unassigned E2E ${Date.now()}`;

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
    await card.getByRole('button', { name: 'Mark Ready for QA' }).click();
    await expect(card.getByText('QA: Ready for QA')).toBeVisible();

    // No Assign QA action taken - qa_assignee stays null throughout.
    // Same session, same person, self-picking QA on their own ticket -
    // exactly the behavior that existed before qa_assignee was added.
    await expect(card.getByRole('button', { name: 'Start QA' })).toBeVisible();
    await card.getByRole('button', { name: 'Start QA' }).click();
    await expect(card.getByText('QA: In QA')).toBeVisible();
    await logout(page);
  });
});
