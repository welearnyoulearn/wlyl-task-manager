// Init: default week to today
document.getElementById('weekOf').valueAsDate = new Date();
updateWeekLabel();

// Restore session (if any) — Supabase Auth persists its own session in
// localStorage under its own key, so this just checks whether a valid
// session already exists and re-derives the profile from it.
async function restoreSession() {
  const { data } = await sb.auth.getSession();
  if (data?.session?.user) {
    await onAuthenticated();
  }
}
restoreSession();
