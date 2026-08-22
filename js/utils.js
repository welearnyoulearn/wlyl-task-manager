// ---------- ISO week number ----------
function getISOWeek(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  target.setDate(target.getDate() - dayNr + 3); // Thursday of this week
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstDayNr = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNr + 3);
  const weekNum = 1 + Math.round((target - firstThursday) / (7 * 24 * 3600 * 1000));
  return { week: weekNum, year: target.getFullYear() };
}

function formatWeekLabel(dateStr) {
  const info = getISOWeek(dateStr);
  if (!info) return '';
  return `Week ${info.week}, ${info.year}`;
}

function updateWeekLabel() {
  const dateStr = document.getElementById('weekOf').value;
  document.getElementById('weekLabel').textContent = dateStr ? formatWeekLabel(dateStr) : '';
}


function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ---------- Synthetic email for Supabase Auth ----------
// Login/admin UX stays username-based; this is only used internally
// when talking to sb.auth so real emails never need to be collected.
// Usernames can contain spaces/punctuation that aren't valid in an email
// local-part, so strip everything except letters/digits/dot/dash/underscore.
function toSyntheticEmail(username) {
  const local = username.toLowerCase().trim().replace(/[^a-z0-9._-]/g, '');
  return `${local}@wlyl.local`;
}
