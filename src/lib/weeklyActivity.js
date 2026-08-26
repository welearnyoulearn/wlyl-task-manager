// Auto-detects a person's ticket activity within a week's date range, for
// Submit Update's "Your ticket activity this week" section (Phase 5 Part A).
//
// There is no history table for tasks (no old->new status log), so
// "what changed" is necessarily current-state-plus-activity, not a real
// from->to diff - see NOTES.md Phase 5 entry for why. A ticket qualifies
// for a given week if the person is its assignee or qa_assignee AND
// EITHER its updated_at falls in the week range (covers any status/
// qa_status change, since 009_updated_at.sql's trigger bumps it on any
// tasks row update) OR they posted a comment/bug report on it in that
// range - each of those is grouped under one entry per ticket, not
// duplicated per event.
export function computeWeeklyActivity(allTasks, currentUser, currentUserId, weekStart, weekEnd) {
  if (!currentUser || !weekStart || !weekEnd) return [];
  const startMs = new Date(weekStart + 'T00:00:00').getTime();
  const endMs = new Date(weekEnd + 'T23:59:59.999').getTime();
  const inRange = (iso) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return !Number.isNaN(t) && t >= startMs && t <= endMs;
  };
  const nameLower = currentUser.toLowerCase();

  const results = [];
  for (const task of allTasks) {
    const isAssignee = (task.assignee || '').toLowerCase() === nameLower;
    const isQaAssignee = currentUserId && task.qaAssignee === currentUserId;
    if (!isAssignee && !isQaAssignee) continue;

    const updatedInRange = isAssignee && inRange(task.updatedAt);
    const comments = (task.comments || []).filter(c => c.author.toLowerCase() === nameLower && inRange(c.at));
    const bugReports = (task.bugReports || []).filter(b => (b.reportedBy || '').toLowerCase() === nameLower && inRange(b.createdAt));

    if (!updatedInRange && comments.length === 0 && bugReports.length === 0) continue;

    results.push({
      ticketKey: task.key,
      ticketId: task.ticketId,
      title: task.title,
      status: task.status,
      qaStatus: task.qaStatus || 'Not Ready',
      commentCount: comments.length,
      bugReportCount: bugReports.length,
      isAssignee,
      isQaAssignee
    });
  }

  return results.sort((a, b) => (a.ticketId || '').localeCompare(b.ticketId || ''));
}

// Human-readable summary line, e.g. "status: Done · QA: Passed · 2 comments, 1 bug report"
export function summarizeActivity(item) {
  const parts = [`status: ${item.status}`, `QA: ${item.qaStatus}`];
  const events = [];
  if (item.commentCount > 0) events.push(`${item.commentCount} comment${item.commentCount === 1 ? '' : 's'}`);
  if (item.bugReportCount > 0) events.push(`${item.bugReportCount} bug report${item.bugReportCount === 1 ? '' : 's'}`);
  if (events.length > 0) parts.push(events.join(', '));
  return parts.join(' · ');
}
