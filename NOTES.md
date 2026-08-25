# Migration and QA-workflow notes — things noticed but intentionally NOT changed

Per the migration constraints, this is a pure structural port (vanilla
HTML/CSS/JS → Vite + React) with zero functional changes. Anything below
was observed during the port but deliberately left as-is, matching the
original behavior exactly. Review separately before acting on any of it.

## 1. "Ticket ID auto-linking anywhere" doesn't actually scan free text

The README says: *"Clicking any ticket ID anywhere in the app... or a
`[WLYL-####]` tag inside a weekly report) opens... Ticket Detail."*

The actual original code (`js/updates.js`, `js/tasks.js`) never scans
arbitrary text for a `WLYL-####` pattern. Ticket links only appear where
the app explicitly renders a dedicated `<span class="ticket-link">`:

- The ticket ID shown in a task card's header (Tasks Board / My Tasks /
  Ticket Detail / By Person tickets).
- The `[ticketId]` tag next to a weekly report's Completed/In Progress
  section — but **only** when that section has a ticket selected via the
  dropdown, not when someone types `WLYL-1234` by hand into the free-text
  Completed/In Progress/Blocked/Learned/Next Week fields.

So if a member types "Fixed the login bug, see WLYL-42" as free text
instead of using the ticket dropdown, that mention is **not** clickable
today — only the structured `completed_ticket_id`/`in_progress_ticket_id`
columns produce a link. This was preserved exactly (React's `EntryCard`
component mirrors the same explicit-tag-only linking); a true text-scan
auto-linker would be a new feature, not a migration task.

## 2. `escapeHtml` removal — confirmed safe, not audited case-by-case

The original app manually called `escapeHtml()` before interpolating
user-controlled strings (names, comments, ticket titles, etc.) into
`innerHTML` template strings, because raw string concatenation into
`innerHTML` is an XSS vector. React components instead pass values as
JSX children/props, which React escapes by default before writing to the
DOM — so the equivalent protection exists structurally, without needing
an explicit escape call at each site. No component in this port uses
`dangerouslySetInnerHTML`, `innerHTML`, or renders raw HTML strings, so
there should be no regression here. Worth a second pair of eyes given
it's a security-relevant behavior, not just a refactor.

## 3. `admins` / `members` legacy tables

Still present and unused, per the original README's "Known gaps"
section. Not touched — dropping them is a database change, out of scope
for a frontend structural migration.

## 4. Weekly Excel export + email — still not built

Unchanged from the original README: the Edge Function doesn't exist yet,
and `supabase/003_weekly_export_cron.sql` should still not be run.

## 5. Per-bullet multi-ticket linking — still not built

Each weekly report section (Completed/In Progress) still supports only
one linked ticket via a single `<select>`, exactly as before. The
`weekly_update_items` table mentioned in the original README schema is
still unused by the UI.

## 6. RLS policies — still permissive

No Supabase policy changes were made. `using (true)` policies noted in
the original "Known gaps" are untouched.

## 7. Session restore shows a near-blank loading state

The original app had no explicit loading UI while `sb.auth.getSession()`
resolved on first load — the landing page's underlying DOM was just
already present (hidden behind `display:none` toggles) and got revealed
once auth resolved. The React port renders a minimal header-only shell
during that same restore window (`AuthProvider`'s `restoring` flag in
`App.jsx`) rather than a fully blank page, so there's a brief visual
difference (a bare header rather than nothing) during the async session
check. This is a structural necessity of React's initial-render model,
not a behavior change to any interactive flow — flagging it since "pixel
identical" was a hard constraint and this is the one spot where the
render sequence isn't literally identical frame-for-frame.

## 8. No client-side router / URL state

The original app never used the URL to reflect which tab or ticket was
open — everything was in-memory `display:none`/`active` class toggling,
with no deep-linking, and Ticket Detail wasn't addressable by URL either.
The React port preserves this exactly (tab state lives in `useState` in
`App.jsx`, not in the URL). Worth considering as a genuine improvement
later (shareable links to a specific ticket or tab) but that would be a
new feature, so it's parked here rather than implemented.

---

# Phase 2 — QA workflow layer

## 9. No notifications on QA state changes

Failing QA, passing QA, or logging a bug report doesn't notify anyone —
the assignee finds out only by looking at the ticket. Given the team is
small, this may be fine, but a "your ticket failed QA" signal (even just
a highlighted row somewhere, not necessarily email/Slack) seems like an
obvious next step once this phase is confirmed working. Not built —
flagging per the instruction to note rather than implement.

## 10. `Failed → Ready for QA` re-submission was inferred, not specified

The original spec didn't say what happens after a ticket fails QA. I
implemented "Mark Ready for QA" as available from both `Not Ready` and
`Failed` (gated on `status === 'Done'` either way), so a dev can fix the
bug and resubmit for QA without the ticket getting stuck. This was
confirmed with the user before implementing, but flagging here too since
it's a state-machine detail invented during this phase, not pulled
directly from written requirements. There's no explicit signal on the
ticket that this is a *re-submission* after a prior failure (the old
`Failed` bug report just stays visible under "Resolved" or "Open bug
reports" once someone marks it resolved) — worth deciding later whether
a failed→ready resubmission should require the prior bug report(s) to be
marked resolved first, which is not currently enforced.

## 11. `reported_by` / `submitted_by` are usernames, not UUID FKs — RESOLVED in Phase 3 Step 1

Originally: `bug_reports.reported_by` and `test_evidence.submitted_by`
were `text` columns storing the username, matching the existing
`tasks.assignee` / `task_comments.author` convention, deliberately not a
`uuid references profiles(id)` at the time (see the old reasoning this
replaces, below).

Phase 3 Step 1 (`supabase/005_fk_fixes.sql`) added the real FK:
`reported_by_id uuid references profiles(id)` and `submitted_by_id`
likewise, backfilled by case-insensitive username match. **Backfill
verified with zero orphaned rows** (confirmed directly via the live
database: all 6 existing `bug_reports` rows and both `test_evidence`
rows matched cleanly to `narendra`'s profile). `AuthContext` now exposes
`currentUserId` (the Supabase Auth user id) alongside the existing
`currentUser` (username string) specifically to support this — this is
the first place in the app that plumbs `auth.uid()`-equivalent identity
client-side, which matters for Step 2's RLS policies since several of
them need `auth.uid()` to check.

The migration is intentionally staged: PART 1 (add + backfill, applied)
keeps the old text columns alongside the new FK, and app code now writes
*both* on every insert during this transition window. PART 2 (drop the
old text columns, NOT YET RUN) is gated behind two conditions: zero
orphans (confirmed) and the deployed app writing the new columns on
every insert (true in code now, but only takes effect once this branch
ships to production — do not run PART 2 until after that deploy is
confirmed live, or new rows arriving via the *old* production code
would silently lack `reported_by_id`/`submitted_by_id`).

Display-side, `DataContext.jsx` now joins `profiles` via the new FK
(`profiles!reported_by_id(username)`) and prefers that over the legacy
text column, which stays only as a fallback until PART 2 removes it.

## 12. "Pass QA" always sets `status = 'Done'` unconditionally on write

`passQa()` in `TaskCard.jsx` only includes `status: 'Done'` in the update
payload when `task.status !== 'Done'` — this was a deliberate choice to
avoid an unnecessary write, not a functional gap, but flagging in case
you'd rather it always write `status: 'Done'` unconditionally for
auditability (e.g. if `updated_at` triggers or history logging get added
to `tasks` later, a no-op branch here would silently skip refreshing
that timestamp on an already-Done ticket passing QA).

## 13. No guard against double-submitting a bug report on rapid double-click

`BugReportForm`'s submit button disables (`submitting` state) once
clicked, which should prevent the obvious case, but there's no
server-side idempotency key — a flaky double-submit under network lag
could theoretically insert two bug reports for one Fail QA action. Not
observed, not specifically tested, flagging as a low-probability edge
case rather than something addressed.

## 14. TicketDetailPanel required no changes

The spec asked for qa_status badge, full bug report history, and full
test evidence history on Ticket Detail. Since `TicketDetailPanel`
already renders the full `TaskCard` for the ticket (the same component
used on Tasks Board / My Tasks / By Person), and `TaskCard` now shows
all of that by default with no truncation, `TicketDetailPanel.jsx` itself
needed zero code changes — this was a case where the existing shared-card
architecture from Phase 1 already covered a Phase 2 requirement for
free. Confirming this wasn't overlooked, not silently skipped.

## 15. Dropped-ids audit (dropped-ids-cleanup pass) — resolved

Phase 1's React migration silently dropped `id` attributes present in
the original vanilla app. Two (`taskAssignee`, `assignTaskStatus`) were
found and fixed during Phase 2 testing because they broke real
Playwright specs; that fix's own NOTES.md entry estimated "~30 more"
still missing, based on a grep that turned out to be incomplete.

This pass re-derived the list properly: extracted every `id="..."` from
`index.html` at the last pre-migration commit (`48f2de9`), plus every
dynamically-templated id (`pwToggle_${safeId}`, `pwRow_${safeId}`,
`pwInput_${safeId}`, `comment_${t.id}`, `updateComment_${e.key}`) from
the original `js/*.js` files, and diffed the full set against current
`src/`. The real count was **68 dropped static ids + 5 dropped dynamic
ids = 73**, not ~30 — worth remembering that a quick grep during a
different task easily undercounts this kind of thing.

Every dropped id was checked against what the original JS actually did
with it (`getElementById`/`querySelector` call sites) and against every
CSS rule in `styles.css` that targeted an id selector, then sorted into:

**(a) Styling hooks — real regressions, fixed (4 ids):**
- `cornerLoginBtn`, `cornerUserBadge` (`LoginCorner.jsx`) — a mobile
  breakpoint rule (`font-size:12px; padding:8px 12px`) silently never
  applied to the sign-in button or the signed-in user badge on small
  screens, since neither id existed to match.
- `adminBox`, `memberBox` (`Landing.jsx`'s `LoginBox`) — `#adminBox
  .landing-login-box-icon` tints the Admin card's ◆ icon amber
  (`#b57519`); with the id missing, both Member and Admin icons
  silently rendered in the same default teal. Verified fixed via
  computed-style check (`rgb(181, 117, 25)` vs `rgb(31, 138, 112)`),
  not just id presence — see `regression-ids.spec.js`.

**(b) JS behavior hooks — checked for regression, none found (2 of 2 verified safe):**
The original codebase's *only* two `.focus()` calls (grepped across all
of `js/*.js` to be sure nothing else was missed) were `toggleLandingBox`
focusing the username field on box-open, and `showPasswordChangeRow`
focusing the new-password field on row-open. Both are reproduced in
React via `autoFocus` (`Landing.jsx`, `PasswordChangeCell.jsx`) — no
code fix was needed, but both now have a dedicated regression test
(`regression-ids.spec.js`) asserting focus actually lands on the right
element, since the *id* that would have exposed a future regression no
longer exists to grep for.

**(c) Obsolete DOM hooks — left dropped, not restored (67 ids: 62 static + 5 dynamic):**
Every other dropped id was a pure `getElementById(...).value` read, a
`.textContent`/`.innerHTML` render target, or a `classList`/`style.display`
toggle in the original vanilla JS — the exact category of thing React's
controlled-component state (`useState`) replaces structurally. This
includes all Submit Update form fields, all filter dropdowns, all
status-message divs (`loginStatus`, `setupStatus`, `manageAdminStatus`,
`manageMemberStatus`, etc.), the admin-management form fields, the six
`adminTab`–`adminTab6` visibility toggles (obsolete because
`AdminSidebar` now conditionally *mounts* instead of toggling
`display`), and the 5 dynamic comment/password-row ids (obsolete because
`useState`-driven conditional rendering replaced the toggle mechanism
entirely). Each was checked against the original JS logic before being
placed here — none involve focus, scroll, or any effect beyond value-read
or class/style toggling, so there is no known user-facing behavior gap.
Not restoring these is a judgment call, not a settled fact: if a future
integration (a browser extension, a userscript, an external test suite)
ever needs to target one of these elements by its original id, that's a
legitimate reason to revisit this list — it isn't closed off, just not
acted on without a concrete need.

**Test suite after this pass: 20/20 passing** (16 from Phase 1 + 2,
1 new assertion added to `auth.spec.js`, 3 new tests in
`tests/e2e/regression-ids.spec.js`), run for real against production
Supabase with the same dedicated test accounts used throughout.

---

# Phase 3 Step 2 — RLS hardening (`006_rls_hardening.sql`)

## 16. `tasks.status` and `tasks.qa_status` share one UPDATE surface at the RLS layer

Per user confirmation before writing SQL: `tasks` needed two different
UPDATE policies because two different actors legitimately change
different fields on the same row — dev `status` changes are
assignee-or-admin, but `qa_status` changes (Start/Pass/Fail QA) are
"any member," by design, since QA is meant to be done by whoever picks
the ticket up next, not the dev who worked it (see README "QA
workflow"). Postgres RLS policies can't scope themselves to specific
*columns* of an UPDATE — only whether the whole row-level UPDATE is
allowed — and multiple permissive policies are OR'd together. The
practical result: `tasks_update_qa` (any authenticated user) is broad
enough that, via a direct API call rather than the app's UI, a non-
assignee could technically also change `status` in the same request
that changes `qa_status`. The app itself never constructs such a
request, so this isn't exploitable through normal use, but it's a real
gap at the database layer, not a hidden one — flagged in the migration
file itself and here. Tightening this properly would need either a
Postgres trigger that inspects `OLD`/`NEW` per-column, or moving
`qa_status` to its own table, both bigger changes than this phase's
scope.

## 17. `weekly_updates.user_id` was dead since Phase 1, wired up in this pass

The column has existed since `001_auth_and_ticket_items.sql` but the
app never wrote it — every row had `user_id = null` right up until this
migration. `006_rls_hardening.sql` backfills it (case-insensitive
match against the existing `name` text column, same pattern as
`005_fk_fixes.sql`'s FK backfill) before enabling the owner-only UPDATE
policy, and `SubmitUpdateForm.jsx` now writes `user_id: currentUserId`
on every submit/resubmit. Confirmed via live query before writing the
migration: both existing rows (both `narendra`'s) backfilled with zero
orphans.

## 18. Real diagnostic story: a pre-existing `"anon full access"` policy blocked the whole migration for a while

After first applying `006_rls_hardening.sql`, live negative-path
testing (attempting unauthenticated writes via curl, then cleaning up
each test row) found that `bug_reports`, `test_evidence`,
`weekly_update_comments`, and `profiles` correctly rejected writes —
but `tasks`, `weekly_updates`, and `task_comments` still accepted them
from a completely unauthenticated request. The migration's `drop
policy if exists "tasks_all"` (etc.) had run without error, which is
exactly the trap: `drop policy if exists` succeeds silently whether or
not a policy by that name exists, so a wrong assumption about the
existing policy's name produces no error at all, just a policy that
never actually got removed.

Querying `pg_policies` directly (rather than continuing to guess from
REST behavior) found the real culprit: a policy literally named
`"anon full access"` (`ALL`, `using(true)`, `with_check(true)`) on
exactly those three tables — not created by any migration file in this
repo (`001`–`006` never reference that name), so it must predate this
project's migration history, likely a manual/dashboard-created policy
from early setup. Dropping it by its actual name
(`drop policy if exists "anon full access" on tasks;` etc.) fixed all
three tables immediately, confirmed via the same live negative-path
checks.

Lesson for future RLS work in this project: **verify policy state by
querying `pg_policies` directly, not by trusting a migration file's own
assumptions about what's already there** — `drop policy if exists`
gives no signal when it silently does nothing.

**Test suite after this pass: 22/22 passing** (20 existing + 2 new
negative-path tests in `tests/e2e/rls-negative.spec.js`), run for real
against production Supabase, ~1.3 minutes. The two new tests call the
Supabase REST API directly with a real logged-in user's own access
token — bypassing the app's UI entirely — to prove RLS itself rejects
the write, not just that a button is hidden: a non-admin member cannot
insert a task directly, and a member cannot edit another user's weekly
report.

Also fixed alongside this migration: `TicketDetailPanel.jsx` was
passing `showAssignee={true}` unconditionally to `TaskCard`, which
means the ticket delete button (admin-only at the RLS layer as of this
migration) was visible to any member who opened Ticket Detail — pre-
existing since the Phase 1 migration, harmless while RLS was fully
permissive, but would have surfaced as a confusing failed-permission
error once real RLS was enforced. Now gated to `showAssignee={isAdmin}`.

**Deferred, not done in this pass:** `weekly_update_items` (the unused
per-bullet-ticket-linking table from `001`) still has its original
permissive policy — it's genuinely unused by any current code path (see
note 5 above), so tightening it wasn't in scope for tables the app
actually reads/writes. Phase 3 Step 3 (dropping the legacy `admins`/
`members` tables) has not started yet.
