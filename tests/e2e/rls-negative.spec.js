import { test, expect } from '@playwright/test';
import { TEST_MEMBER, TEST_ADMIN, requireTestAccounts, loginFromLanding, logout, directApiCall, getCurrentUserId } from './helpers.js';

test.beforeAll(requireTestAccounts);

// These are negative-path tests: they prove RLS is actually enforced at
// the database level, not just that the UI hides certain buttons. Each
// one logs in normally (so the request carries a real, valid session
// token for that user), then calls the Supabase REST API directly —
// bypassing the app's own JS entirely — to attempt something that
// user should not be allowed to do, and asserts the server rejects it.
test.describe('RLS negative paths', () => {
  test('a non-admin member cannot insert a task directly (Assign Task is admin-only)', async ({ page }) => {
    await loginFromLanding(page, 'member', TEST_MEMBER);

    const res = await directApiCall(page, {
      method: 'POST',
      path: 'tasks',
      body: {
        title: 'RLS negative test - should be rejected',
        assignee: TEST_MEMBER.username,
        status: 'Assigned'
      }
    });

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.message).toContain('row-level security');
  });

  test('a member cannot edit a weekly report they do not own', async ({ page }) => {
    // Log in as admin first to find (or create) a report that belongs to
    // the admin, not the member — then switch to the member and attempt
    // to overwrite it directly.
    await loginFromLanding(page, 'admin', TEST_ADMIN);
    const listRes = await directApiCall(page, {
      method: 'GET',
      path: `weekly_updates?select=id,name,week_of&name=eq.${encodeURIComponent(TEST_ADMIN.username)}&limit=1`
    });
    const existing = await listRes.json();

    let targetId;
    if (existing.length > 0) {
      targetId = existing[0].id;
    } else {
      // No existing report for the admin — create one via direct API
      // (as the admin, so this insert is legitimate — user_id must match
      // the admin's own auth.uid() to satisfy weekly_updates_insert)
      // so there's a not-mine row for the member to attempt to edit below.
      const adminUserId = await getCurrentUserId(page);
      const createRes = await directApiCall(page, {
        method: 'POST',
        path: 'weekly_updates',
        body: { name: TEST_ADMIN.username, week_of: '2026-01-15', user_id: adminUserId, completed: 'seed row for RLS negative test' }
      });
      const created = await createRes.json();
      targetId = created[0]?.id;
    }
    expect(targetId).toBeTruthy();

    await logout(page);
    await loginFromLanding(page, 'member', TEST_MEMBER);
    const editRes = await directApiCall(page, {
      method: 'PATCH',
      path: `weekly_updates?id=eq.${targetId}`,
      body: { completed: 'RLS negative test - member should not be able to write this' }
    });

    // PostgREST returns 204 with an empty result set (not a 403) when an
    // UPDATE's USING clause excludes every row it would otherwise match
    // - RLS silently filters the row out rather than erroring, so "no
    // rows changed" is itself the proof the write was blocked.
    const editedRows = editRes.status() === 204 ? [] : await editRes.json();
    expect(editedRows.length).toBe(0);

    // Confirm directly that the row's content is unchanged.
    const verifyRes = await directApiCall(page, {
      method: 'GET',
      path: `weekly_updates?select=completed&id=eq.${targetId}`
    });
    const verified = await verifyRes.json();
    expect(verified[0]?.completed).not.toContain('member should not be able to write this');
  });
});
