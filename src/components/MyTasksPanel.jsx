import { useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import TaskCard from './TaskCard.jsx';

const STATUS_ORDER = { Assigned: 0, Blocked: 1, 'In Progress': 2, 'Not Started': 3, Done: 4 };

export default function MyTasksPanel({ active }) {
  const { currentUser, currentUserId } = useAuth();
  const { allTasks, loadAllTasks } = useData();

  useEffect(() => {
    if (active) loadAllTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // "My Tasks" includes both dev assignments and tickets routed to this
  // person via qa_assignee (Phase 4's admin-driven QA assignment) -
  // without this, a tester assigned QA duty on someone else's ticket
  // would have no page in the app showing it to them at all. Found via
  // qa-assignment.spec.js actually exercising a routed-but-not-dev-
  // assigned ticket end to end.
  const mine = useMemo(() => {
    if (!currentUser) return [];
    return allTasks
      .filter(t => t.assignee.toLowerCase() === currentUser.toLowerCase() || (currentUserId && t.qaAssignee === currentUserId))
      .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
  }, [allTasks, currentUser, currentUserId]);

  return (
    <div className={`panel ${active ? 'active' : ''}`} id="panel-mytasks">
      <div id="myTasksList">
        {mine.length === 0
          ? <div className="empty">No tasks assigned to you yet.</div>
          // showAssignee stays false here (as before qa_assignee existed)
          // - it also gates the admin-only delete button in TaskCard, so
          // this isn't safe to flip on just to show the dev-assignee
          // label for qa_assignee-routed tickets. The QA: <username>
          // label (task.qaAssigneeUsername, always shown when set) is
          // enough to signal "this ticket involves someone else".
          : mine.map(t => <TaskCard key={t.key} task={t} showAssignee={false} />)}
      </div>
    </div>
  );
}
