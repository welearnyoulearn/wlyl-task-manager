# Migration notes — things noticed but intentionally NOT changed

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
