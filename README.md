# Weekly Update Tracker (WLYL)

A lightweight team tool for tracking weekly work updates and task/ticket assignment — Vite + React, backed by Supabase, deployed to Vercel.

**Live site:** see the project's Vercel dashboard for the current deployment URL.

## What this tool does

Every week, each team member writes a short update (what they completed, what's in progress, what they learned, what's blocking them, and what's next). Admins assign tasks/tickets to members, track their status, and review everyone's weekly updates and ticket activity from one place — including commenting directly on either a ticket or a weekly report.

## How it works — full workflow

### 1. Signing in

- The landing page has two collapsible cards: **Member** and **Admin**. Click one to reveal its username/password fields and sign in — no separate mode toggle.
- The very first time the app runs (no admin exists yet), the landing page shows a "Set up the first admin account" link instead.
- Accounts are created only by an admin (Manage Members / Manage Admins panels) — there's no self-signup. Login is real Supabase Auth under the hood, but the UI stays simple: pick a username, set a password.

### 2. Admin assigns work

- **Assign Task** (admin sidebar): pick a person, set title, description, due date, priority. This creates a ticket with an auto-generated ID (`WLYL-####`) in `Assigned` status.

### 3. Member does the work

- **My Tasks**: shows tasks assigned to that member. A newly assigned task needs to be **accepted** first (`Accept Task` button) before its status can be changed — this records both when it was assigned and when it was accepted.
- Once accepted, status moves through `Not Started → In Progress → Blocked → Done` via a dropdown on the ticket card. Anyone (member or admin) can post comments directly on a ticket's card.

### 3a. QA workflow (once a ticket reaches Done)

Every ticket has a second, independent status — `qa_status` — that tracks QA verification separately from dev progress (`status`). It's shown as its own color-coded badge on the ticket card, next to the dev status:

| `qa_status` | Badge color | Meaning |
|---|---|---|
| `Not Ready` | grey | Default. Dev work isn't done yet, or hasn't been queued for QA. |
| `Ready for QA` | amber | Dev marked it ready; waiting for a tester to pick it up. |
| `In QA` | amber | A tester is actively verifying it. |
| `Passed` | green | QA verified it works. |
| `Failed` | red | QA found a problem — see the bug report attached below the ticket. |

The state machine and who can trigger each transition:

- **Mark Ready for QA** (`Not Ready` or `Failed` → `Ready for QA`) — only enabled once dev `status` is `Done`. This is what lets a ticket re-enter the QA queue after a fix, since `Failed` isn't a dead end.
- **Start QA** (`Ready for QA` → `In QA`) — any member, not just admins (QA in this app is done by regular team members, not a separate admin-only role).
- **Pass QA** (`In QA` → `Passed`) — also force-advances dev `status` to `Done` if it somehow isn't already, so a passed ticket is never left showing an incomplete dev status.
- **Fail QA** (`In QA` → `Failed`) — opens the bug report form inline; submitting it both logs the bug and flips `qa_status` to `Failed` in one action. `qa_status` never changes without a bug report attached when failing this way.

Independently of that flow, anyone can also:
- **Report Bug** — log a bug against a ticket at any time, without going through "Fail QA" (doesn't change `qa_status`).
- **Attach Test Run** — log a Playwright run's result (a CI/trace URL, pass/fail counts, optional notes) against a ticket, for a record of what automated coverage has actually been run against it.

Each bug report shows steps to reproduce, expected vs. actual behavior, a color-coded severity tag (Blocker/Major/Minor/Cosmetic), optional environment and evidence-link fields, and who reported it. **Mark Resolved** (setting `resolved`/`resolved_at`) is available to the ticket's assignee or any admin. Resolved and open bug reports are grouped separately on the ticket.

All of this — the QA badge, the action buttons, bug reports, and test evidence — appears everywhere a ticket card renders (Tasks Board, My Tasks, By Person, Ticket Detail), since they all share the same `TaskCard` component.

**Tasks Board** also has a QA Status filter alongside the existing Person/Status filters, with its own live counts row per `qa_status`.

### 4. Member submits a weekly report

- **Submit Update**: one form per person per week — Completed, In Progress, category hours (Dev/Research/Testing/Docs), Learned, Blocked, Next Week.
- Each of the Completed/In Progress sections has an **optional** ticket dropdown (only showing that member's own accepted tickets). Linking a ticket is not required — a report with no ticket selected is still a fully valid submission.
- Submitting **upserts** one row per `(name, week)` — resubmitting the same week edits the existing report instead of creating a duplicate.

### 5. Admin reviews everything

The admin sidebar (visible only to admins, alongside the shared top tabs everyone has) has six views:

| View | What it shows |
|---|---|
| **All Updates** | Every weekly report across the team, filterable by person/week, with summary totals |
| **By Person** | One person's Weekly Reports *and* their Tickets (with full comment threads) side by side, plus a **Print summary** button |
| **Tasks Board** | Every ticket across everyone, filterable by person/status, with live status counts |
| **Assign Task** | The task-creation form |
| **Manage Admins** | Promote a member, add an admin directly, remove an admin, or reset any admin's password |
| **Manage Members** | Add/remove members, reset any member's password |

Clicking **any ticket ID anywhere** in the app (Tasks Board, My Tasks, By Person, or a `[WLYL-####]` tag inside a weekly report) opens a shared **Ticket Detail** view: the full ticket card plus every weekly report that mentioned it — so there's one place to see a ticket's complete history regardless of where it's referenced.

Admins can also comment directly on a weekly report itself (not just on a ticket) — useful when a member wrote about something in their update without linking a ticket to it.

### 6. Weekly Excel export + email *(in progress, not yet complete)*

Planned: an automatic Sunday export of the week's reports (one row per ticket, per person) emailed to the team lead, plus a manual download button for admins. The database side is scaffolded (see `supabase/003_weekly_export_cron.sql`), but the actual export/email Edge Function has not been built yet — **do not run `003_weekly_export_cron.sql` until that function exists**, or the scheduled job will fail every week with no effect.

## Project structure

```
task-manager/
  index.html                Vite entry HTML — just <div id="root"> + script tag
  vite.config.js             Vite config (React plugin, base path)
  vercel.json                  Vercel build/output config + SPA rewrite
  playwright.config.js          Playwright config (starts the dev server, runs tests/e2e)
  src/
    main.jsx                     App bootstrap — mounts React, wraps providers
    App.jsx                       Top-level layout: tab switching, admin sidebar gating
    styles.css                     All styling (teal/amber WLYL brand palette) — unchanged
    assets/wlyl-logo.png            Brand logo (previously inlined as base64 in index.html)
    lib/
      supabase.js                    Supabase client, callManageUser (Edge Function caller)
      utils.js                        ISO week helpers, synthetic-email helper
    context/
      AuthContext.jsx                 Session state, login/logout, first-admin setup
      ProfilesContext.jsx              profiles (admins/members) data layer
      DataContext.jsx                  weekly_updates + tasks data layer
      TicketDetailContext.jsx           Shared Ticket Detail overlay + "return tab" memory
    components/
      Landing.jsx, AuthModal.jsx, LoginCorner.jsx        Sign-in flows
      TabBar.jsx, AdminSidebar.jsx                        Navigation
      SubmitUpdateForm.jsx                                 Submit Update
      MyTasksPanel.jsx, TasksBoardPanel.jsx, AssignTaskPanel.jsx, TaskCard.jsx   Tasks/tickets
      BugReportForm.jsx, BugReportCard.jsx, TestEvidenceForm.jsx                 QA workflow (rendered inside TaskCard)
      MyHistoryPanel.jsx, HistoryPanel.jsx, ByPersonPanel.jsx, EntryCard.jsx      Weekly reports
      TicketDetailPanel.jsx                                Shared ticket detail view
      ManageAdminsPanel.jsx, ManageMembersPanel.jsx, PasswordChangeCell.jsx       Admin user mgmt
      CommentThread.jsx                                    Shared comment list + post box
  tests/
    e2e/                          Playwright specs (see tests/README.md)
    README.md                      How to run/add E2E tests
  supabase/
    001_auth_and_ticket_items.sql   profiles table, weekly_update_items, RLS setup
    002_weekly_update_comments.sql   Comments-on-weekly-reports table (safe to run now)
    003_weekly_export_cron.sql        Export cron — DO NOT RUN until the export function exists
    004_qa_workflow.sql                tasks.qa_status column + bug_reports + test_evidence tables, RLS
    backfill-auth-users.mjs           One-time script: migrates old plaintext accounts to real Supabase Auth
    functions/manage-user/index.ts    Edge Function: admin-only create/promote/remove/set-password
  .github/workflows/ci.yml        PR gate: build + Playwright, required before merge to main
```

## Data model (Supabase)

- **`profiles`** — one row per user (`id` = Supabase Auth user id, `username`, `is_admin`). Source of truth for identity and role.
- **`weekly_updates`** — one row per person per week (the report form fields).
- **`weekly_update_comments`** — admin/member comments on a weekly report.
- **`tasks`** — tickets, with `ticket_id` auto-generated, `assignee`, `status`, `qa_status`, timestamps. `status` (Assigned/Not Started/In Progress/Blocked/Done) tracks dev progress; `qa_status` (Not Ready/Ready for QA/In QA/Passed/Failed) tracks QA verification independently — see "QA workflow" above.
- **`task_comments`** — comments on a ticket.
- **`bug_reports`** — zero or more bugs logged against a ticket during QA (steps/expected/actual, severity, environment, evidence link, resolved/resolved_at). `reported_by` is a plain username string, matching `tasks.assignee`/`task_comments.author` — not a UUID FK to `profiles`, to stay consistent with how identity is stored everywhere else in this schema.
- **`test_evidence`** — Playwright run results attached to a ticket (CI/trace URL, pass/fail counts, optional notes). `submitted_by` is likewise a plain username string.
- **`admins` / `members`** — legacy plaintext-password tables from before the Supabase Auth migration; superseded by `profiles` but not yet deleted (see Known gaps below).

## Authentication

Login is real Supabase Auth (email+password under the hood), but the UI only ever asks for a **username** — each username maps internally to a synthetic email (`username@wlyl.local`) so no one has to provide or see a real email address. Admin actions that need elevated privilege (creating/removing accounts, resetting passwords) go through the `manage-user` Edge Function, which runs with the Supabase service role key server-side — that key is never exposed to the browser.

Passwords are hashed by Supabase Auth and can never be viewed by anyone, including admins — only reset.

## Local development

```bash
npm install
npm run dev        # starts Vite dev server on http://localhost:5173
```

All data reads/writes go straight to Supabase using the public anon key
embedded in `src/lib/supabase.js` — write access is governed entirely by
Supabase Row Level Security policies (see the `supabase/*.sql` files) and
the `manage-user` Edge Function. There is no local/mock backend — the dev
server talks to the same live Supabase project as production.

## Building

```bash
npm run build       # outputs a deployable static build to dist/
npm run preview      # serve dist/ locally to sanity-check a production build
```

## Testing

```bash
npx playwright install chromium   # first time only
npm run test:e2e                   # run the Playwright E2E suite headless
npm run test:e2e:ui                 # run it in Playwright's interactive UI mode
```

See [tests/README.md](tests/README.md) for test-account setup and how to
add new tests. There is no unit test suite yet — coverage today is E2E
only.

## CI

`.github/workflows/ci.yml` runs on every pull request into `main`: a
production build (`npm run build`) and the full Playwright suite. Both
must pass before a PR can merge — configure this as a required status
check under repo **Settings → Branches → Branch protection rules** for
`main` (this is a one-time manual GitHub setting, not something the
workflow file itself enforces).

CI does not deploy anything — it only gates PRs.

## Deployment

Deployment is via **Vercel**, connected to this repository. Vercel
builds with `npm run build` and serves the `dist/` output (see
`vercel.json`), independently of the CI workflow above. There is no
auto-deploy wired into GitHub Actions — trigger/manage deploys from the
Vercel dashboard.

Because Vite hashes filenames in `dist/assets/` on every build
(`index-<hash>.js`, `index-<hash>.css`), there is no manual
cache-busting step to remember anymore — every build gets fresh,
uniquely-named asset URLs automatically.

## Known gaps / in-progress work

- **`admins`/`members` tables are legacy.** The app has migrated to Supabase Auth + `profiles`, but the old plaintext tables haven't been dropped yet — they're unused by the current code but still exist in the database.
- **Weekly Excel export + email is not finished.** Schema and a manual/scheduled trigger plan exist, but the actual Edge Function that generates the spreadsheet and sends the email hasn't been built.
- **Per-bullet multi-ticket linking was never built.** Each weekly report section (Completed/In Progress) can only link one ticket, even if the member worked on several that week — a `weekly_update_items` table exists in the schema for this but the UI still uses the older single-ticket-per-section form.
- **RLS policies are real role/ownership-based rules as of `supabase/006_rls_hardening.sql`** — `profiles`, `tasks`, `task_comments`, `weekly_update_comments`, `weekly_updates`, `bug_reports`, and `test_evidence` all have named policies scoped to the caller's own identity or admin status (see that migration file for the exact rules per table). `weekly_update_items` (unused by any current UI) still has its original permissive policy — see NOTES.md. The legacy `admins`/`members` tables have not been dropped yet.

See [NOTES.md](NOTES.md) for observations from the vanilla-JS → React migration itself (things noticed but deliberately left unchanged, pending separate review).
