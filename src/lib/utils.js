// ---------- ISO week number ----------
export function getISOWeek(dateStr) {
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

export function formatWeekLabel(dateStr) {
  const info = getISOWeek(dateStr);
  if (!info) return '';
  return `Week ${info.week}, ${info.year}`;
}

// ---------- Relative time ----------
// "Last updated: 3 hours ago" style formatting for tasks.updated_at.
// Deliberately coarse (minutes/hours/days/weeks, no seconds) since this
// is a glance-at-a-ticket UI, not a live-updating one.
export function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  const diffWeek = Math.round(diffDay / 7);
  if (diffWeek < 5) return `${diffWeek} week${diffWeek === 1 ? '' : 's'} ago`;
  return new Date(isoString).toLocaleDateString();
}

// ---------- Synthetic email for Supabase Auth ----------
// Login/admin UX stays username-based; this is only used internally
// when talking to sb.auth so real emails never need to be collected.
// Usernames can contain spaces/punctuation that aren't valid in an email
// local-part, so strip everything except letters/digits/dot/dash/underscore.
export function toSyntheticEmail(username) {
  const local = username.toLowerCase().trim().replace(/[^a-z0-9._-]/g, '');
  return `${local}@wlyl.local`;
}
