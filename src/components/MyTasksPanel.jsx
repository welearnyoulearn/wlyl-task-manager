import { useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import TaskCard from './TaskCard.jsx';

const STATUS_ORDER = { Assigned: 0, 'On Hold': 1, 'In Progress': 2, 'Not Started': 3, Done: 4 };

// Whether this ticket currently needs the logged-in person to do
// something (vs. just being in progress or fully resolved) - drives
// the "Needs your action" badge on each card. Deliberately does NOT
// reorder or regroup the list itself: an earlier version grouped
// tickets into separate sections and moved a card between them when
// its status changed, which meant a card's DOM node could be torn down
// and recreated in a different part of the page mid-interaction (e.g.
// right after clicking Accept Task) - a real bug, not just a test
// artifact, found via qa-assignment.spec.js and member-roles.spec.js
// both timing out on a ticket that had visibly stalled mid-click. A
// badge on a card that never moves has no such risk.
export function needsAction(t, currentUserId, memberRole, isAdmin) {
  const qaStatus = t.qaStatus || 'Not Ready';
  const isQaAssignee = t.qaAssignee && t.qaAssignee === currentUserId;
  const canDoDev = isAdmin || memberRole === 'developer' || memberRole === 'both';
  const canDoQaHere = (isAdmin || memberRole === 'tester' || memberRole === 'both') && (isQaAssignee || isAdmin);

  if (t.status === 'Assigned') return true;
  if (canDoDev && t.status === 'Done' && (qaStatus === 'Not Ready' || qaStatus === 'Failed')) return true;
  if (canDoQaHere && (qaStatus === 'Ready for QA' || qaStatus === 'In QA') && !!t.qaAssignee) return true;
  return false;
}

export default function MyTasksPanel({ active }) {
  const { currentUser, currentUserId, isAdmin, currentMemberRole } = useAuth();
  const { allTasks, loadAllTasks } = useData();

  useEffect(() => {
    if (active) loadAllTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // "My Tasks" includes both dev assignments and tickets routed to this
  // person via qa_assignee (Phase 4's admin-driven QA assignment) -
  // without this, a tester assigned QA duty on someone else's ticket
  // would have no page in the app showing it to them at all.
  const mine = useMemo(() => {
    if (!currentUser) return [];
    return allTasks
      .filter(t => t.assignee.toLowerCase() === currentUser.toLowerCase() || (currentUserId && t.qaAssignee === currentUserId))
      .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
  }, [allTasks, currentUser, currentUserId]);

  const actionCount = useMemo(
    () => mine.filter(t => needsAction(t, currentUserId, currentMemberRole, isAdmin)).length,
    [mine, currentUserId, currentMemberRole, isAdmin]
  );

  return (
    <div className={`panel ${active ? 'active' : ''}`} id="panel-mytasks">
      {mine.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          {actionCount > 0
            ? <span><strong style={{ color: 'var(--danger)' }}>{actionCount}</strong> ticket{actionCount === 1 ? '' : 's'} need{actionCount === 1 ? 's' : ''} your action</span>
            : 'Nothing needs your action right now'}
        </div>
      )}
      <div id="myTasksList">
        {mine.length === 0
          ? <div className="empty">No tasks assigned to you yet.</div>
          // showAssignee stays false here (as before qa_assignee existed)
          // - it also gates the admin-only delete button in TaskCard, so
          // this isn't safe to flip on just to show the dev-assignee
          // label for qa_assignee-routed tickets. The QA: <username>
          // label (task.qaAssigneeUsername, always shown when set) is
          // enough to signal "this ticket involves someone else".
          : mine.map(t => (
            <TaskCard
              key={t.key}
              task={t}
              showAssignee={false}
              needsAction={needsAction(t, currentUserId, currentMemberRole, isAdmin)}
            />
          ))}
      </div>
    </div>
  );
}
