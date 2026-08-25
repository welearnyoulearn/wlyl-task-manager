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

## 11. `reported_by` / `submitted_by` are usernames, not UUID FKs

Confirmed with the user before implementing (see the "Identity column
type" decision): `bug_reports.reported_by` and `test_evidence.submitted_by`
are `text` columns storing the username, matching the existing
`tasks.assignee` / `task_comments.author` convention — not a `uuid
references profiles(id)` as the original spec literally described. No
code in this app currently writes `auth.uid()` anywhere; introducing that
pattern for just these two tables would be inconsistent with every other
write path and is better done as a deliberate, app-wide change (probably
alongside the Phase 3 RLS tightening, which needs `auth.uid()` for real
policies anyway).

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
