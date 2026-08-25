import CommentThread from './CommentThread.jsx';
import { useTicketDetail } from '../context/TicketDetailContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { sb } from '../lib/supabase.js';

const STATUS_COLORS = {
  Assigned: '#b57519', 'Not Started': '#6b6b6b', 'In Progress': '#1F8A70', Blocked: '#a83232', Done: '#124F41'
};

const STATUS_OPTIONS = ['Not Started', 'In Progress', 'Blocked', 'Done'];

export default function TaskCard({ task, showAssignee, onChanged }) {
  const { openTicketDetail } = useTicketDetail();
  const { loadAllTasks } = useData();
  const { currentUser } = useAuth();

  const needsAccept = task.status === 'Assigned';

  const acceptTask = async () => {
    try {
      const { error } = await sb.from('tasks').update({
        status: 'Not Started',
        accepted_at: new Date().toISOString()
      }).eq('id', task.key);
      if (error) throw error;
      await loadAllTasks();
      onChanged && onChanged();
    } catch (e) {
      alert('Could not accept task: ' + e.message);
    }
  };

  const updateStatus = async (status) => {
    try {
      const { error } = await sb.from('tasks').update({ status }).eq('id', task.key);
      if (error) throw error;
      await loadAllTasks();
      onChanged && onChanged();
    } catch (e) {
      alert('Could not update status: ' + e.message);
    }
  };

  const deleteTask = async () => {
    if (!confirm('Delete this task?')) return;
    try {
      const { error } = await sb.from('tasks').delete().eq('id', task.key);
      if (error) throw error;
      await loadAllTasks();
      onChanged && onChanged();
    } catch (e) {
      alert('Could not delete: ' + e.message);
    }
  };

  const postComment = async (text) => {
    try {
      const { error } = await sb.from('task_comments').insert({
        task_id: task.key, author: currentUser, text
      });
      if (error) throw error;
      await loadAllTasks();
      onChanged && onChanged();
    } catch (e) {
      alert('Could not post comment: ' + e.message);
    }
  };

  return (
    <div className="entry-card">
      <div className="entry-head">
        <span className="entry-name">
          <span className="ticket-link" onClick={() => openTicketDetail(task.ticketId || '')}>{task.ticketId || ''}</span>
          &nbsp;{task.title} {showAssignee && (
            <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}> &rarr; {task.assignee}</span>
          )}
        </span>
        <span className="entry-week">{task.dueDate ? 'Due ' + task.dueDate : ''}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
        Assigned {task.assignedAt ? new Date(task.assignedAt).toLocaleString() : '—'}
        {task.acceptedAt ? ' · Accepted ' + new Date(task.acceptedAt).toLocaleString() : ''}
      </div>
      {task.description && (
        <div className="entry-block"><pre>{task.description}</pre></div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '10px 0', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: STATUS_COLORS[task.status] || '#6b6b6b' }}>
          &#9679; {task.status}
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Priority: {task.priority || 'Normal'}</span>
        {needsAccept ? (
          <button className="btn-primary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={acceptTask}>Accept Task</button>
        ) : (
          <select
            value={task.status}
            onChange={(e) => updateStatus(e.target.value)}
            style={{ fontSize: 12, padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 6 }}
          >
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {showAssignee && (
          <button className="del-btn" onClick={deleteTask}>delete</button>
        )}
      </div>
      <CommentThread comments={task.comments} onPost={postComment} />
    </div>
  );
}
