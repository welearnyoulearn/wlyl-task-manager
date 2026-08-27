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

---

# Phase 4 — Member sub-roles, last-updated tracking, admin-driven QA assignment

## 19. RLS can't scope an UPDATE to specific columns — a real gap, closed with a trigger, not just documented

`tasks` has two separate PERMISSIVE UPDATE policies (`tasks_update_dev_fields`,
`tasks_update_qa`), OR'd together by Postgres per note #16. Once
`008_member_roles.sql` tightened each to require a qualifying
`member_role`, live testing found this was a **real, exploitable gap,
not theoretical**: a `tester`-role assignee's direct-API write to
`status`/`accepted_at` went through, because the write still satisfied
`tasks_update_qa`'s broad "any qualified tester" row-level check even
though `tasks_update_dev_fields` alone would have rejected it — and the
same happened in reverse for a `developer`-role assignee writing
`qa_status`. Root-caused by querying `pg_policies` directly and by
writing negative-path tests that actually attempted these writes
(`member-roles.spec.js`), not by reasoning about the policy SQL alone.

Given the choice between "leave it as a documented caveat" (Phase 3's
resolution for a similar RLS limitation, note #16) and "add a trigger,"
the user chose the trigger this time, since it's the only way to
actually close a column-scoping gap in Postgres RLS. `010_qa_assignee.sql`
PART 3 adds `enforce_tasks_column_role_gate()`, a `BEFORE UPDATE` trigger
that inspects `OLD` vs `NEW` per field and rejects (via `raise exception`)
any write a caller's role doesn't qualify for — dev fields
(`status`/`accepted_at`) require assignee + `developer`/`both`; QA fields
(`qa_status`) require `tester`/`both`, except **Mark Ready for QA**
(`qa_status` moving `Not Ready`/`Failed` → `Ready for QA`), which is
itself a dev action per `TaskCard.jsx`'s `canMarkReadyForQa` and requires
the dev role instead; `qa_assignee` writes are admin-only, period. Admins
bypass the whole trigger.

**The first version of this trigger had a real bug**, caught by
`member-roles.spec.js`'s developer-role test actually exercising the
legitimate "Mark Ready for QA" step (not the negative-path check) and
failing on it: it required a tester role for *every* `qa_status`
transition, not accounting for Mark Ready for QA being a dev action that
happens to write `qa_status`. Fixed by special-casing that one
transition. Lesson: a trigger like this needs to be verified against the
*legitimate* paths through the state machine, not just the negative
paths it's meant to block — testing only the rejection case would have
shipped a trigger that also broke a real feature.

Also closes a second, smaller gap the same way: `tasks_update_qa`'s
RLS policy alone couldn't stop a qualified tester from setting
`qa_assignee` directly (RLS can't tell "this write only touches
`qa_assignee`" from any other `tasks_update_qa`-satisfying write) even
though "Assign QA" is admin-only in the UI. The trigger's explicit
`qa_assignee`-is-admin-only check closes this too — see the corrected
comment in `010_qa_assignee.sql` PART 2 (the original comment there
called this an accepted, open caveat; it no longer is).

**PostgREST response-shape gotcha, worth remembering for future
negative-path tests:** when RLS's `USING` clause silently excludes a row
from an UPDATE (rather than a trigger raising an exception), PostgREST
doesn't reliably return `204 No Content` — it can return `200` with an
empty JSON array body instead, depending on the `Prefer` header. A test
asserting `expect(writeRes.ok()).toBe(false)` is **wrong** in that case,
since a 200 response is `ok()`. The correct check: if `writeRes.ok()`,
assert the response body is an empty array; otherwise assert a non-2xx
status (the trigger-exception path). All three of this phase's
negative-path tests (`member-roles.spec.js` x2, `qa-assignment.spec.js`
x1) were initially wrong this way and had to be fixed.

## 20. Admin-driven QA assignment surfaced two real application bugs, not just RLS gaps

`tasks.qa_assignee` (nullable FK to `profiles`) lets an admin route a
ticket to one specific qualified tester via **Assign QA** on Tasks
Board; `Start QA` becomes gated to that person (or an admin) at both the
UI and RLS/trigger layers when set, and self-pick behavior is preserved
exactly when it's left null (default). Building the negative-path tests
for this (`qa-assignment.spec.js`) found two bugs in the feature itself,
not just gaps in enforcement:

- **`MyTasksPanel` never showed `qa_assignee`-routed tickets at all** —
  it filtered strictly by `t.assignee` (dev assignee), so a ticket
  routed to someone who *wasn't* the dev assignee was invisible in every
  page of the app to the very person it was routed to. This made the
  entire admin-QA-routing feature non-functional end-to-end for the
  non-assignee case — not a pre-existing gap, a bug in this phase's own
  feature. Fixed in `MyTasksPanel.jsx`: the filter now also matches
  `currentUserId === t.qaAssignee`. Deliberately did **not** flip
  `showAssignee` to true for these cards, since that prop also gates the
  admin-only delete button in `TaskCard` — kept `showAssignee={false}`
  unconditionally on My Tasks to avoid an unrelated permission
  regression; the `QA: <username>` label is enough to signal "this
  ticket involves someone else."

- **The Assign QA picker was sometimes empty** — its tester list comes
  from `useProfiles()`, which nothing had triggered a load for on a
  fresh admin session landing directly on Tasks Board or Ticket Detail
  (previously only Assign Task / Manage Members / Manage Admins
  triggered `loadProfiles()`). Fixed by adding a `loadProfiles()` call
  to both panels' active-effects.

**Confirmed, not fixed — a pre-existing app-wide navigation gap that's
now more load-bearing:** there is no UI path to a ticket for a non-admin
who is neither its dev assignee nor its `qa_assignee` — My Tasks only
shows your own; Tasks Board/By Person are admin-only; there's no ticket
search or URL-based ticket routing anywhere in the app. This predates
Phase 4, but it means "any qualified tester can self-pick an unrouted
ticket" was always, in practice, "the ticket's own assignee, if also
tester-qualified, can self-pick" — a `tester`-only member who isn't the
dev assignee could never reach the ticket to begin with, `qa_assignee`
or not. `qa-assignment.spec.js`'s self-pick regression test uses a
`both`-role assignee for this reason, since that's the only case
actually reachable through the UI today. Worth considering a "my QA
queue" or ticket-search view later; not built now.

## 21. `member_role` is null for admins, by design

Admins get every dev/QA action regardless of role, so `member_role`
being consulted for an admin account would never actually change
behavior — kept `null` rather than defaulting admins to `'both'`, so it
doesn't imply a role check happens for them anywhere. `profiles.member_role`
defaults to `'both'` for everyone else (including all pre-existing
member rows, via the migration's default), preserving pre-Phase-4
behavior (any member could do any action) until an admin deliberately
narrows someone's role.

**Test suite after this phase: 26 tests total, 24 passed, 1 skipped
(pre-existing conditional in `comments.spec.js` — "no tasks/reports yet,
run X first" — unrelated to this phase), 1 confirmed-flaky failure**
(`qa-workflow.spec.js`'s "fails it with a bug report" test hit a stale-
card timing issue against a My Tasks page loaded with dozens of
accumulated synthetic tickets from repeated debugging runs across this
project's test history — passed cleanly on an isolated re-run, and every
other test sharing the same helper function passed in the full run,
confirming this wasn't a real regression). Run for real against
production Supabase, full suite ~2 minutes. Dedicated `tester`/
`developer` test accounts were added (`E2E_TESTER_*`/`E2E_DEVELOPER_*`
in `.env.test`) since the existing `TEST_MEMBER` account has
`member_role = 'both'` and can't exercise either role's negative path on
its own.

**Deferred, not done in this pass:** no cleanup/teardown was added for
accumulated synthetic E2E test data (tickets, comments) — matches
existing project convention (see `tests/README.md`), but the volume is
now large enough to have caused the one flaky failure above; worth
reconsidering a teardown or a periodic manual cleanup pass if flakiness
recurs.

---

# Phase 5 follow-up — mandatory test plan + mandatory QA assignment

## 22. Test plan required on Mark Ready for QA

Clicking "Mark Ready for QA" now opens a required dialog: the assignee
must provide a test plan (what QA should verify) before the click can
actually flip `qa_status` to `Ready for QA`. Both fields
(`qa_status` and `test_plan`) are written in the same request, and the
test plan is then visible on the ticket card indefinitely (no separate
"share with tester" mechanism needed — whoever can see the ticket sees
the plan). Enforced at the database level too
(`supabase/012_test_plan.sql` extends the existing
`enforce_tasks_column_role_gate` trigger with a not-null-at-transition
check), not just by the dialog requiring the field client-side. No
character limit — any non-empty, non-whitespace-only text is accepted.

Also fixed at the same time: **Report Bug** and **Attach Test Run**
buttons are now gated to `tester`/`both`/admin (`canDoQaActions`) —
previously any dev assignee saw them regardless of role, which didn't
match the rest of the QA-action gating pattern (Start/Pass/Fail QA were
already role-gated, these two were overlooked).

## 23. QA assignment is now mandatory — self-pick removed entirely

Previously (Phase 4, note #20): `qa_assignee` was optional — if an
admin didn't route a ticket to a specific tester, any qualified tester
could self-pick it via Start QA. This is now removed: a ticket at
`Ready for QA` with `qa_assignee` still null shows no Start QA button
to **anyone**, including a `both`-role member who is also the ticket's
own dev assignee (previously the one case that was actually reachable
through the UI, per note #20's finding about navigation gaps). The
ticket instead shows a red `QA: unassigned` flag next to its title.

Enforced at three layers, consistent with this project's established
pattern for QA-routing rules:
- **UI** (`TaskCard.jsx`): `canStartQa` now requires
  `!!task.qaAssignee` in addition to `isQaAssignee`.
- **RLS** (`supabase/013_mandatory_qa_assignment.sql`
  PART 1): `tasks_update_qa`'s USING clause no longer treats a null
  `qa_assignee` as "any qualified tester passes" — it now requires
  `tasks.qa_assignee = auth.uid()` unconditionally for non-admins.
- **Trigger** (same migration, PART 2): `enforce_tasks_column_role_gate`
  gained a dedicated branch for the `Ready for QA -> In QA` transition
  specifically, raising a clear exception ("has not been assigned to a
  tester yet" vs. "only the assigned tester can start QA") depending on
  which condition failed — closes the same RLS column-scoping gap
  this trigger has closed for every other transition since Phase 4.

**Test impact:** `qa-assignment.spec.js`'s second test used to confirm
self-pick *worked* as a deliberate regression check; it now confirms
self-pick is *blocked* (same ticket setup, inverted assertion — no
Start QA button, plus a negative-path direct-API check). Every test in
`qa-workflow.spec.js` that drives a ticket through Start QA had to gain
an explicit admin-assigns-QA-to-self step first, since `TEST_MEMBER`
(the account those tests use, `member_role = 'both'`) can no longer
reach Start QA without going through Assign QA like anyone else.

---

# Phase 5 follow-up 2 — On Hold reason, mandatory due date, standalone
# bug/evidence actions removed, deploy signal, default tab

## 24. "Blocked" renamed to "On Hold" everywhere, with a mandatory reason

Ticket status's third value (`Not Started -> In Progress -> ? -> Done`)
is now `On Hold` instead of `Blocked` — same meaning, different label,
plus a new requirement: selecting it opens a dialog requiring a reason
before the status actually changes (same UX pattern as Mark Ready for
QA's mandatory test plan). The reason (`tasks.hold_reason`, new nullable
column) is then shown on the ticket to anyone who can see it.

This is a rename of an existing status *value*, not just a label swap
in the UI — `supabase/014_on_hold_reason.sql` updates every existing
row already sitting at `status = 'Blocked'` to `'On Hold'` too (with
`hold_reason` left null, since no reason was ever captured for those).
`tasks.status` has no check constraint restricting its values
(confirmed by grepping every migration file before writing this one),
so this was a safe plain data update, not a schema/constraint change.

Enforced at the database level too, not just the dialog requiring the
field client-side: `enforce_tasks_column_role_gate` (the same trigger
that's gated every dev/QA column-write rule since Phase 4) gained a
check inside its existing dev-fields branch — moving `status` to
`'On Hold'` without a non-empty `hold_reason` in the same request is
rejected with an exception, same pattern as `012_test_plan.sql`'s
mandatory-test-plan check.

## 25. Standalone "Report Bug" and "Attach Test Run" removed

Both were QA-only actions that let a tester log a bug or record a test
run's result *independent* of the Fail QA flow. Removed per explicit
request — the reasoning given was that these are QA-specific actions a
developer shouldn't see, and rather than keep two extra entry points
into `bug_reports`/`test_evidence`, they're gone entirely. **Fail QA's
own bug-report step is unchanged** — it's the only remaining way to
create a `bug_reports` row, since recording *why* QA failed is core to
the QA workflow itself, not the standalone "log a bug anytime" feature.

`TestEvidenceForm.jsx` is now fully orphaned (no other trigger ever
existed for it) and was deleted outright. `BugReportForm.jsx` lost its
`failsQa` conditional prop/behavior (title "Report a bug" vs "Fail QA —
bug report", button text, whether it also flips `qa_status`) since
every remaining call site fails QA - simplified to always do so.

Existing `bug_reports` and `test_evidence` rows are untouched and still
display on a ticket's card (collapsed behind "Show details", per Phase
5's earlier declutter pass) — only the ability to *create new*
test-evidence rows, or bug reports outside of Fail QA, was removed.
`test_evidence` display code is intentionally still in `TaskCard.jsx`
for this reason, even though nothing can insert into it anymore through
the UI.

**Test impact:** `qa-workflow.spec.js`'s "attaching test evidence
renders it on the ticket" test was deleted outright — the feature it
tested no longer has a UI entry point.

## 26. Due date is now mandatory on Assign Task

Previously optional (`due_date: dueDate || null`); now required before
the confirm dialog will even open, same field-error pattern as the
`assignee`/`title` checks already there. Not enforced at the database
level — `tasks.due_date` has no `not null` constraint, and adding one
retroactively wasn't safe without first confirming no existing row has
a null due date (not checked - out of scope for a UI-only requirement
change). Every test that assigns a task now fills a due date
(`2026-12-31`) before opening the confirm dialog - 5 call sites across
`task-assignment.spec.js`, `qa-workflow.spec.js`, `qa-assignment.spec.js`
(x2), and `member-roles.spec.js` (x2).

## 27. Default landing tab changed from Submit Update to My Tasks

A member's most common need on opening the app is "what do I need to
do," not the weekly-reporting form — and Submit Update's own valid
empty state ("No ticket activity detected this week") could read as a
blank/broken page to someone unfamiliar with it, which is what
prompted this change. `weekly-update.spec.js`'s two Submit-Update-tab
tests had to gain an explicit tab click first, since they'd relied on
Submit Update being the default landing view.

## 28. "Ready to deploy" badge + Tasks Board no longer hides Passed tickets

A `qa_status = 'Passed'` ticket now shows a distinct 🚀 "Ready to
deploy" badge, visible only to admins — the explicit ask was "admin
should easily see a passed ticket so they can push it live." This
directly conflicted with the Tasks Board's existing default-hide-Passed
filter from the earlier declutter pass (note in Phase 5's first
follow-up): a badge that's hidden by the same page's default filter
defeats the point. Resolved by removing the Passed auto-hide from Tasks
Board entirely — decided against keeping a "Show completed" toggle with
nothing left to filter (would have been dead/no-op UI), so the toggle
and its state were removed outright rather than kept as a placeholder.

## 29. Deferred / still pending

Three requests from the same batch are NOT yet implemented, waiting on
inputs from the user:
- **File upload on ticket description** (admin conveys requirements via
  file, visible to the assignee) — needs Cloudflare R2 credentials.
- **Test plan file upload** (alongside the existing text input) — needs
  R2 credentials.
- **Fail QA photo upload** (tester attaches up to 5 screenshots) — needs
  R2 credentials.
- **Report Bug/Attach Test Run role-gating bug** — user reported seeing
  these buttons on what was described as a developer-only account
  (they should be tester/both/admin-only). On inspection the gating
  logic (`canDoQaActions`) looks correct; asked the user to confirm the
  account's actual `member_role` in Manage Members before changing
  anything, since the code review didn't find an obvious bug. Not yet
  confirmed either way. Superseded in practice by note #25 above (the
  buttons in question no longer exist at all), but the underlying
  question of whether `canDoQaActions` has a real gating bug elsewhere
  is still open and worth revisiting if a similar report comes up again.

---

# Phase 5 follow-up 3 — Cloudflare R2 file uploads + mobile/typography pass

## 30. R2 file uploads: task description, test plan, QA screenshots

The three deferred items from note #29 are now implemented, now that R2
credentials were provided. This app has no backend server (every write
goes straight from the browser to Supabase), so the R2 *secret* access
key can never live in client code or a `VITE_*` env var - anything
`VITE_`-prefixed gets bundled into the shipped JS and would leak the
secret to every visitor. Instead, a new Supabase Edge Function,
`supabase/functions/r2-upload`, holds the secret server-side and hands
back a short-lived presigned PUT URL scoped to one object key; the
browser then PUTs the file bytes straight to R2 using that URL. This
mirrors the existing `manage-user` function's pattern (service-role
key server-side only, caller's own JWT checked first) rather than
inventing a new one. Presigning uses `aws4fetch` (R2 is S3-API
compatible) instead of hand-rolling AWS SigV4.

Any authenticated user can request a presigned URL (not admin-only -
developers attach test plans, testers attach QA screenshots, admins
attach task descriptions); the function only proves "a logged-in user
asked", the same as any other write in this app - actual authorization
for what gets attached to which row is still the existing RLS policies
on `tasks`/`bug_reports` when the URL is written there.

**Where each upload lives:**
- Assign Task -> `tasks.description_file_url`/`description_file_name`
  (one file, optional, shown to the assignee as a link under the
  description).
- Mark Ready for QA -> `tasks.test_plan_file_url`/`test_plan_file_name`
  (one file, optional, alongside the existing mandatory text field -
  supplements it, doesn't replace it).
- Fail QA -> `bug_reports.evidence_urls` (up to 5 screenshots, new
  `text[]` column, capped both in the UI picker and by a check
  constraint in `supabase/015_r2_attachments.sql` so a direct API call
  can't exceed it either). Kept separate from the pre-existing
  `evidence_url` text column, which stays as a free-text link field a
  tester can still paste manually (video, external trace, etc.).

**Compression before upload** (the explicit ask: "compress as much as
possible to use less storage, better performance"): only images are
compressed (`src/lib/upload.js`) - documents (test plan/description
attachments can be PDFs, docx, etc.) are uploaded as-is since there's
no safe way to re-encode an arbitrary document client-side. An image is
downscaled via canvas to fit within 1600px on its long edge and
re-encoded as JPEG at 0.75 quality; if that doesn't actually shrink the
file (already-small images), the original is kept rather than forcing
a worse-quality re-encode. This is what actually matters for the QA
screenshot case - phone-camera screenshots routinely run 3-8MB
uncompressed, multiplied by up to 5 per bug report.

**Storage layout:** objects are keyed `{kind}/{uploader-user-id}/{timestamp}-{random}-{filename}`
so the bucket stays organized by purpose and it's obvious in the R2
dashboard what a given object is for and who uploaded it.

**Public URL caveat:** the bucket's public access is currently the
`*.r2.dev` URL, which Cloudflare marks "dev only, rate-limited" - a
deliberate choice for now (confirmed with the user) to get uploads
working immediately rather than block on setting up a custom domain
first. Swapping to a custom domain later is a one-line change (the
`R2_PUBLIC_URL` Edge Function secret), not a code change, since every
URL returned to the client already goes through that variable.

**Not yet done (requires the user to run these - I don't run SQL or
deploy commands myself):**
1. Run `supabase/015_r2_attachments.sql` in the Supabase SQL editor.
2. Set the Edge Function secrets (`supabase secrets set R2_ACCOUNT_ID=... R2_BUCKET=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_PUBLIC_URL=...`).
3. Deploy the function: `supabase functions deploy r2-upload`.

**Security note:** the user pasted the raw R2 credentials (including
the secret access key) directly into chat. They're not stored in any
file in this repo - `.gitignore` was extended to cover `.env`/`.env.local`
defensively, but nothing was written to disk with the actual secret
value; the deploy command above is how the user gets it into Supabase's
own secret store instead.

## 31. Mobile responsiveness + typography pass

Driven by explicit feedback that the app needed to be more "user
friendly," responsive, and legible - confirmed via follow-up questions
that mobile/tablet layout was the main pain point, with a moderate
(not drastic) font-size increase.

**Typography:** raised the base body font-size (15px, was browser
default ~16px inherited inconsistently) and bumped every text tier that
was sitting at 11-12px for genuinely readable content (hints, captions,
table cells, form inputs, entry-card body text) up to roughly 13-15px.
Left alone: short uppercase micro-labels with letter-spacing (badges,
`.qa-badge`, `.severity-tag`, section eyebrows) - those read fine small
by design and bumping them would look oversized/loose, not more
readable.

**Responsiveness:**
- Added a new 1000px breakpoint (tablets/small laptops) - the existing
  700px breakpoint was tuned for phones and left a cramped middle zone
  (filter rows, summary cards, main content padding) on iPad-ish
  widths with no adjustment at all.
- Fixed `#adminSidebar` not actually going full-width horizontal on
  mobile: `AdminSidebar.jsx` sets a Tailwind `w-48` utility class
  directly on the nav element, which was winning over the plain-CSS
  `#adminSidebar { width: 100% }` mobile rule depending on Tailwind's
  injection order - added an `#adminSidebar.w-48` override at the same
  breakpoint so the fixed width can't survive onto a phone screen
  regardless of cascade order.
- Fixed `#authCorner` (the fixed-position sign-in/user badge, top
  right) overlapping the brand header on narrow screens - it now spans
  left-to-right and right-aligns its content instead of just nudging in
  from a fixed corner offset.
- Added a 44px `min-height` to real form controls (text/date/select
  inputs, primary/secondary buttons) at the phone breakpoint only - the
  commonly cited minimum comfortable touch-target size. Deliberately
  scoped to actual form fields and primary buttons, not applied
  globally to every `<button>`, since shadcn's compact/ghost/link
  button variants used throughout TaskCard (inline status controls,
  "Show details" toggle, Cancel links) are meant to stay visually
  small.

**Verified visually**, not just by reading the CSS: launched the dev
server and screenshotted the landing page, My Tasks, Tasks Board, and
Assign Task at both a 390x844 (phone) and 1440x900 (desktop) viewport
via a throwaway Playwright script (not committed). Confirmed the admin
sidebar collapses to a horizontal wrapped row on mobile, the auth
corner no longer overlaps the header, the new file-upload field on
Assign Task renders without overflow, and the desktop layout is
visually unchanged from before this pass.

---

# Phase 5 follow-up 4 — closable tickets, clickable summary cards,
# By Person status filter

## 32. Close Ticket - a final, locked state after QA passes and deploy

Admins asked for a way to mark a Passed ticket as actually shipped -
previously "Passed" plus the "Ready to deploy" badge (note #28) was as
far as the lifecycle went; the ticket just sat there indefinitely.
Added a new `status = 'Closed'` value (`supabase/016_close_ticket.sql`)
- deliberately a distinct final status, not a boolean flag on top of
Done, per explicit confirmation: "Done" still means dev work finished
(a Done ticket can cycle back through QA if it fails), while "Closed"
means deployed and archived. `closed_at`/`closed_by` record who did it
and when.

Closing is enforced admin-only and Passed-only at the database level,
by extending `enforce_tasks_column_role_gate` (the same trigger every
prior mandatory-field/role rule in this app goes through) rather than
adding a separate trigger. Once closed, the same trigger rejects *any*
further UPDATE on that row - closing is a one-way action, matching the
explicit "read-only after" decision. The UI mirrors this: TaskCard hides
the dev-status dropdown and all QA action buttons once `status ===
'Closed'`, though this is presentation only - the actual guarantee is
the DB trigger, same as every other rule in this app.

**Where it lives:** a "Close Ticket" button (admin-only, confirm dialog,
same AlertDialog pattern as Delete) appears next to the status controls
whenever `qa_status === 'Passed' && status !== 'Closed'`. A ✅ Closed
badge replaces the 🚀 Ready to deploy badge once closed.

**Visibility:** closed tickets are hidden from Tasks Board's default
view (confirmed with the user: "hide by default, filterable back in") -
otherwise deployed/archived tickets would pile up at the top of
"Newest first" forever and crowd out active work. Reachable via the
Status filter (including the new Closed summary card, note #33) or via
By Person's new status filter (note #34).

## 33. Tasks Board summary cards are now clickable filters

Both summary rows (dev-status counts and QA-status counts) were
previously decorative - now each card is a button that sets the
matching Status/QA Status filter on click, and clicking an already-
active card clears it back to "All" (there's no separate "clear
filter" control, so this toggle is the only way back once cards are
the entry point). An active card gets a highlighted border/background
(`.summary-card-active`) so it's clear which filter is currently
applied. A new "Closed" card was added to the dev-status row.

The counts themselves are computed from a `scoped` list (all tasks
minus Closed, with the Person filter and Search still applied) rather
than from the currently-`filtered` list - if the counts came from
`filtered`, clicking one card would shrink the numbers shown on every
other card (since Status/QA Status filters would compound), which
would make the cards lie about how many tickets are actually in each
state. Person and Search filters *do* still narrow the counts, since
those represent "the tickets I'm looking at," not a competing status
dimension.

## 34. By Person: ticket status filter

Added a Status dropdown next to the Print Summary button - same
options as Tasks Board's Status filter, including Closed. Filters only
the Tickets section, not Weekly Reports (unrelated data). Fixed a
latent bug while wiring this in: the panel's top-level "no updates or
tickets for this person yet" empty state was checking the *filtered*
ticket count, which would have shown that message (implying the person
has nothing at all) even when they had tickets that just didn't match
the currently-selected status filter - split into a separate
`allPersonTickets` (unfiltered, for the top-level empty check) and
`tickets` (filtered, for the list itself and its own more specific
empty message, e.g. "No On Hold tickets for this person").

## 35. Verified end-to-end against the live app, not just build-checked

Actually drove the app with Playwright (throwaway script, not
committed) rather than only confirming a clean `npm run build`:
confirmed clicking a Tasks Board summary card narrows the list to
matching tickets and clicking it again restores the full count. Also
attempted to seed a Passed-QA ticket directly and click Close Ticket,
which surfaced a real gap worth recording: **migration
`016_close_ticket.sql` had not been run against the live database at
the time of this test**, so the close action failed with
`PGRST204: Could not find the 'closed_at' column` - not a code bug,
just the expected state before the user runs the migration (same
situation as every other new migration in this project - I don't run
SQL myself). Flagged to the user; re-verify Close Ticket once they've
run 016.

---

# Phase 5 follow-up 5 — email notifications (Zoho SMTP) + rename to WLYL Hub

## 36. Real per-user email address (profiles.email)

Every account's `auth.users.email` is a synthetic `{username}@wlyl.local`
address used only to satisfy Supabase Auth's login requirement - it
was never wired to a real inbox. `supabase/017_profile_email.sql` adds
a genuine `profiles.email` column, separate from that, specifically for
outgoing notification mail. Set via a new "Set email"/"Change email"
control (`EmailChangeCell.jsx`, mirrors `PasswordChangeCell.jsx`) on
Manage Admins/Manage Members, and now **required** (not optional) on
the "Add member"/"Add admin" forms - originally shipped optional, but
the user asked to make it mandatory since a missing email is a *silent*
gap (the person just never gets notified, no error anywhere) rather
than something anyone would notice and fix on their own. `manage-user`'s
`create` action now accepts and stores `email` directly on the new
profile row.

## 37. Email sending: Zoho Mail SMTP via a generic Edge Function

New `supabase/functions/send-email` - a generic transactional-email
relay, not tied to one notification type, using `denomailer` (Deno-
native SMTP client; `nodemailer` isn't Deno-compatible) against
`smtp.zoho.com:587` (STARTTLS). Credentials (`ZOHO_SMTP_USER`,
`ZOHO_SMTP_PASSWORD`) are Supabase secrets, same pattern as R2 - never
in client code. `ZOHO_SMTP_PASSWORD` must be a Zoho **app-specific
password**, not the account's real login password - flagged explicitly
to the user after they initially pasted their actual Zoho login
password into chat; they were advised to rotate that password
immediately and generate a proper app password instead, since app
passwords are separately revocable and don't expose the real account
if this app's secret ever leaked.

Any authenticated user may call `send-email` (same caller-JWT-check
pattern as `r2-upload`) - it's a mail relay, not itself a privileged
action; what triggers a send is gated by the calling code, not this
function.

`src/lib/email.js` wraps the fetch call client-side. Deliberately
swallows failures (logs to console, never throws) - a notification
email failing to send should never block or roll back the actual app
action it's attached to.

## 38. The four requested notifications

1. **Task assigned** - `AssignTaskPanel.jsx`'s `assignTask()` looks up
   the assignee's `profiles.email` (via the already-loaded `profiles`
   list) and fires `sendTaskAssignedEmail` right after the insert
   succeeds, with ticket #, title, description, due date, and a link
   back into the app (`?ticket=<id>` query param). Skips silently (no
   error surfaced) if the assignee has no email on file.
2. **1 day before due date**, 3. **on the due date**, 4. **every day
   after, until resolved** - all three come from one new scheduled
   function, `supabase/functions/due-date-reminders`, not three
   separate jobs. It queries every task with a `due_date` whose
   `status` isn't `Done` or `Closed` (On Hold counts as still "owed" -
   the reminder is meant as a nudge to revisit it, not an accusation
   dev work stalled), buckets each by whether `due_date` is tomorrow /
   today / already passed, and sends the matching email. An overdue
   ticket gets re-emailed every single day the sweep runs, for as long
   as it stays overdue - by design, per the explicit request ("daily
   notification" after the due date, no cap mentioned).

   Scheduled via `supabase/018_due_date_reminder_cron.sql`
   (`pg_cron`/`pg_net`, same mechanism as the still-unused precedent in
   `003_weekly_export_cron.sql`) at 09:00 IST daily - normal working
   hours, not a middle-of-the-night UTC slot. This function runs with
   the service-role key directly (no caller-JWT check, unlike
   `send-email`/`r2-upload`) since `pg_cron` invokes it on a schedule,
   not from a logged-in browser session - it is not exposed for
   arbitrary client calls anywhere in the UI.

## 39. Deferred scope

The user was offered (via AskUserQuestion) additional notification
events beyond the 4 requested - On Hold/QA Failed/QA Passed/Closed
status-change emails, and new-comment notifications - and explicitly
chose **none of them, only the original 4**, for now. Not built. Worth
revisiting later if asked.

## 40. App renamed to "WLYL Hub"

The app had outgrown "Weekly Update Tracker" (its original scope,
before the ticket/QA/file-upload/notification system this project
became) - user asked for a naming suggestion; "WLYL Hub" was proposed
and picked (over "WLYL Flow"/"WLYL Pulse") as the most accurate
description of current scope without overpromising. Changed everywhere
it's user-visible: browser tab title (`index.html`), the main `<h1>`
(`App.jsx`), the landing page eyebrow label (`Landing.jsx`), and the
"from" name + body copy in outgoing notification emails.

**Deliberately NOT renamed**: the Vercel project/URL
(`wlyl-task-manager.vercel.app`) and `package.json`'s internal package
name - confirmed with the user to leave these as-is, since changing the
live URL would break the R2 CORS `AllowedOrigins` config (note #30-ish,
the Cloudflare dashboard setting) and any existing bookmarks/links,
for a cosmetic-only gain. The app displays as "WLYL Hub" everywhere a
person sees it; the URL underneath is unchanged.

## 41. Still pending before any email actually sends

- User needs to generate a genuine Zoho app-specific password (their
  first attempt pasted their real account password - see note #37) and
  rotate their real Zoho password since it was exposed in chat.
- Once obtained: `supabase secrets set ZOHO_SMTP_USER=... ZOHO_SMTP_PASSWORD=...`,
  then `supabase functions deploy send-email` and
  `supabase functions deploy due-date-reminders`.
- Run `017_profile_email.sql` (already run - confirmed by successfully
  writing the admin's own email during this session) and
  `018_due_date_reminder_cron.sql` (not yet confirmed run).
- Not yet end-to-end verified with a real send, since the SMTP secrets
  aren't set yet - only build-checked so far.
