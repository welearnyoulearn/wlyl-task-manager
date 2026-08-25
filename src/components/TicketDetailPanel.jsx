import { useEffect, useMemo } from 'react';
import { useData } from '../context/DataContext.jsx';
import { useTicketDetail } from '../context/TicketDetailContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { formatRelativeTime } from '../lib/utils.js';
import TaskCard from './TaskCard.jsx';
import EntryCard from './EntryCard.jsx';

export default function TicketDetailPanel({ active }) {
  const { allEntries, allTasks } = useData();
  const { ticketDetailId, closeTicketDetail } = useTicketDetail();
  const { isAdmin, loadProfiles } = useAuth();

  // Same reasoning as TasksBoardPanel: TaskCard's "Assign QA" picker
  // (admin-only) needs profiles loaded with member_role.
  useEffect(() => {
    if (active && isAdmin) loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, isAdmin]);

  const task = useMemo(() => allTasks.find(t => t.ticketId === ticketDetailId), [allTasks, ticketDetailId]);
  const mentions = useMemo(() => {
    if (!ticketDetailId) return [];
    return allEntries
      .filter(e => e.completedTicketId === ticketDetailId || e.inProgressTicketId === ticketDetailId)
      .sort((a, b) => (b.weekOf || '').localeCompare(a.weekOf || ''));
  }, [allEntries, ticketDetailId]);

  return (
    <div className={`panel ${active ? 'active' : ''}`} id="panel-ticketdetail">
      <div className="sheet" style={{ padding: 20 }}>
        <button className="btn-secondary" onClick={closeTicketDetail}>&larr; Back</button>
      </div>
      <div id="ticketDetailContent" style={{ marginTop: 16 }}>
        {!task ? (
          <div className="empty">Ticket not found.</div>
        ) : (
          <>
            {task.updatedAt && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                Last updated: {formatRelativeTime(task.updatedAt)}
              </div>
            )}
            {/* showAssignee also controls the delete-ticket button (admin-only
                action) - gated to isAdmin here since Ticket Detail is reachable
                by any user, unlike Tasks Board which is admin-sidebar-only. */}
            <TaskCard task={task} showAssignee={isAdmin} />
            <div className="section-title" style={{ margin: '24px 0 10px' }}>Mentioned in weekly reports</div>
            {mentions.length === 0
              ? <div className="empty">Not mentioned in any weekly report yet.</div>
              : mentions.map(e => <EntryCard key={e.key} entry={e} />)}
          </>
        )}
      </div>
    </div>
  );
}
