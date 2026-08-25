import { test, expect } from '@playwright/test';
import {
  TEST_ADMIN, TEST_TESTER, TEST_DEVELOPER,
  requireTestAccounts, requireRoleTestAccounts,
  loginFromLanding, logout, directApiCall
} from './helpers.js';

test.beforeAll(() => {
  requireTestAccounts();
  requireRoleTestAccounts();
});

test.describe('Member sub-roles (Developer / Tester / Both)', () => {
  test('a tester-role assignee cannot make dev-status changes: UI hides Accept/status, and a direct API write is rejected by RLS', async ({ page }) => {
    const title = `Role gate dev E2E ${Date.now()}`;

    // Admin assigns a fresh task directly to the tester account. This is
    // an unusual assignment on purpose - it isolates "is the assignee"
    // from "does the assignee have a qualifying role", which is exactly
    // the distinction tasks_update_dev_fields (008_member_roles.sql)
    // is supposed to enforce.
    await loginFromLanding(page, 'admin', TEST_ADMIN);
    await page.locator('#adminSidebar').getByText('Assign Task').click();
    await page.locator('#taskAssignee').selectOption({ label: TEST_TESTER.username });
    await page.locator('#panel-assigntask input[placeholder*="staging environment"]').fill(title);
    await page.getByRole('button', { name: 'Assign Task' }).click();
    await expect(page.locator('#assignTaskStatus')).toContainText('assigned to');
    await logout(page);

    // UI check: the tester, viewing their own assigned task, should see
    // no Accept Task button and no status dropdown at all - canDoDevActions
    // gates both to null when member_role is 'tester' (TaskCard.jsx).
    await loginFromLanding(page, 'member', TEST_TESTER);
    await page.locator('#tabBar').getByText('My Tasks').click();
    const card = page.locator('#myTasksList .entry-card', { hasText: title });
    await expect(card).toBeVisible();
    await expect(card.getByRole('button', { name: 'Accept Task' })).toHaveCount(0);
    await expect(card.locator('select').filter({ hasText: 'Not Started' })).toHaveCount(0);

    // Negative-path API check: even bypassing the UI entirely, a direct
    // write attempting the dev-status transition (accepting the task)
    // must be rejected by tasks_update_dev_fields at the database level.
    const taskRes = await directApiCall(page, {
      method: 'GET',
      path: `tasks?select=id,status&title=eq.${encodeURIComponent(title)}`
    });
    const [task] = await taskRes.json();
    expect(task).toBeTruthy();
    expect(task.status).toBe('Assigned'); // unchanged - UI never touched it

    // The write is rejected one of two ways depending on which layer
    // catches it: RLS's USING clause silently filters the row out of
    // the UPDATE (a 2xx response with zero rows in its representation,
    // not necessarily 204 - PostgREST's exact status depends on the
    // Prefer header and can be 200 with an empty array) if it doesn't
    // satisfy either permissive policy at all, or - the case that
    // actually applies here, since the write DOES satisfy
    // tasks_update_qa's broad "any qualified tester" check - the
    // tasks_enforce_column_role_gate trigger raises a Postgres
    // exception, which PostgREST surfaces as a non-2xx response with a
    // JSON error body (see 010_qa_assignee.sql PART 3 for why both
    // layers exist). Checking writeRes.ok() alone is NOT enough to tell
    // these apart from a genuine success - a 200 with an empty array is
    // still `ok()`.
    const writeRes = await directApiCall(page, {
      method: 'PATCH',
      path: `tasks?id=eq.${task.id}`,
      body: { status: 'Not Started', accepted_at: new Date().toISOString() }
    });
    if (writeRes.ok()) {
      const body = writeRes.status() === 204 ? [] : await writeRes.json();
      expect(body.length).toBe(0);
    } else {
      const errorBody = await writeRes.json();
      expect(errorBody.message).toContain('developer or both member_role');
    }

    const verifyRes = await directApiCall(page, {
      method: 'GET',
      path: `tasks?select=status&id=eq.${task.id}`
    });
    const [verified] = await verifyRes.json();
    expect(verified.status).toBe('Assigned');

    await logout(page);
  });

  test('a developer-role assignee cannot perform QA actions: UI hides Start QA, and a direct API write is rejected by RLS', async ({ page }) => {
    const title = `Role gate qa E2E ${Date.now()}`;

    // Admin assigns to the developer, who drives it to Done and Ready for
    // QA themselves (both dev-only actions, which the developer role is
    // allowed to do) - the negative path is specifically Start QA next.
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
    await expect(card.getByText('● Done')).toBeVisible();
    await card.getByRole('button', { name: 'Mark Ready for QA' }).click();
    await expect(card.getByText('QA: Ready for QA')).toBeVisible();

    // UI check: no Start QA button for a developer-only member, even
    // though they're the ticket's own assignee.
    await expect(card.getByRole('button', { name: 'Start QA' })).toHaveCount(0);

    // Negative-path API check: a direct qa_status write must be rejected
    // by tasks_update_qa (008_member_roles.sql), which requires
    // is_admin or member_role in ('tester','both').
    const taskRes = await directApiCall(page, {
      method: 'GET',
      path: `tasks?select=id,qa_status&title=eq.${encodeURIComponent(title)}`
    });
    const [task] = await taskRes.json();
    expect(task).toBeTruthy();
    expect(task.qa_status).toBe('Ready for QA');

    // Same two-layer rejection shape as the dev-fields test above - this
    // write satisfies tasks_update_dev_fields (developer role, own
    // assignment) at the RLS layer, so it's the
    // tasks_enforce_column_role_gate trigger that actually blocks it.
    const writeRes = await directApiCall(page, {
      method: 'PATCH',
      path: `tasks?id=eq.${task.id}`,
      body: { qa_status: 'In QA' }
    });
    if (writeRes.ok()) {
      const body = writeRes.status() === 204 ? [] : await writeRes.json();
      expect(body.length).toBe(0);
    } else {
      const errorBody = await writeRes.json();
      expect(errorBody.message).toContain('tester');
    }

    const verifyRes = await directApiCall(page, {
      method: 'GET',
      path: `tasks?select=qa_status&id=eq.${task.id}`
    });
    const [verified] = await verifyRes.json();
    expect(verified.qa_status).toBe('Ready for QA');

    await logout(page);
  });
});
