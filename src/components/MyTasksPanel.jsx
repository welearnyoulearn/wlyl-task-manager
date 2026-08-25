import { useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import TaskCard from './TaskCard.jsx';

const STATUS_ORDER = { Assigned: 0, Blocked: 1, 'In Progress': 2, 'Not Started': 3, Done: 4 };

export default function MyTasksPanel({ active }) {
  const { currentUser } = useAuth();
  const { allTasks, loadAllTasks } = useData();

  useEffect(() => {
    if (active) loadAllTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const mine = useMemo(() => {
    if (!currentUser) return [];
    return allTasks
      .filter(t => t.assignee.toLowerCase() === currentUser.toLowerCase())
      .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
  }, [allTasks, currentUser]);

  return (
    <div className={`panel ${active ? 'active' : ''}`} id="panel-mytasks">
      <div id="myTasksList">
        {mine.length === 0
          ? <div className="empty">No tasks assigned to you yet.</div>
          : mine.map(t => <TaskCard key={t.key} task={t} showAssignee={false} />)}
      </div>
    </div>
  );
}
