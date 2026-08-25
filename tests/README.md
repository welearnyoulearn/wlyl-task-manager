# E2E tests (Playwright)

These tests drive the real app in a browser against the **live Supabase
project** (there is no separate test backend) using two dedicated test
accounts. They are not unit tests — they exercise actual login, task
assignment, weekly updates, and comments end to end.

## One-time setup

1. In the running app, sign in as an existing admin and create two
   accounts to be used **only** by these tests (never a real teammate's
   account, since tests create/modify/accept data under them):
   - **Manage Members** → add a member, e.g. username `e2e-test-member`
   - **Manage Admins** → "Add a new admin", e.g. username `e2e-test-admin`
2. Copy the env template and fill in the passwords you chose:
   ```
   cp .env.test.example .env.test
   ```
   `.env.test` is gitignored — never commit real credentials.

## Running

```bash
npm install
npx playwright install chromium   # first time only, downloads the browser
npm run test:e2e                  # headless run
npm run test:e2e:ui               # Playwright's interactive UI mode
```

`playwright.config.js` starts the Vite dev server automatically
(`webServer`), so you don't need `npm run dev` running separately —
though if it's already running on port 5173, Playwright reuses it
locally (not in CI).

## What's covered

| File | Flow |
|---|---|
| `auth.spec.js` | Member login, admin login, admin box rejects a non-admin account |
| `task-assignment.spec.js` | Admin assigns a task → member must Accept before the status dropdown appears → member changes status |
| `weekly-update.spec.js` | Submit Update with and without a linked ticket; resubmitting the same week upserts instead of duplicating |
| `tasks-board.spec.js` | Admin Tasks Board renders and the status filter narrows the list |
| `ticket-detail.spec.js` | Clicking a ticket id opens the shared Ticket Detail view and "Back" returns to the originating tab |
| `comments.spec.js` | Posting a comment on a ticket, and directly on a weekly report |

Tests run in a fixed order within a spec (`workers: 1`,
`fullyParallel: false`) because they share the same two live accounts
and some specs depend on state created by an earlier one (e.g. a
member needs an accepted ticket before "link a ticket" can be tested).
If you run a single spec file in isolation and it depends on earlier
state that doesn't exist yet, it uses `test.skip(...)` rather than
failing — run `task-assignment.spec.js` first if you see skips.

## Adding a new test

1. Add a new `*.spec.js` file under `tests/e2e/`, or a `test(...)` block
   in an existing one if it belongs to the same flow.
2. Import `TEST_MEMBER` / `TEST_ADMIN` and `loginFromLanding` /
   `logout` from `./helpers.js` rather than re-implementing login.
3. Prefer selecting by visible text/role/placeholder (as the existing
   specs do) over CSS classes, so tests stay readable and don't silently
   break in a future component refactor.
4. Since this suite runs against production data, any record a test
   creates (a task, a weekly update, a comment) is real and permanent —
   there is no teardown step. Keep test data clearly labeled (the
   existing specs prefix titles/comments with `E2E` and a timestamp) so
   it's identifiable and safe to clean up manually later if needed.
