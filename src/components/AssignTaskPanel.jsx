import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useProfiles } from '../context/ProfilesContext.jsx';
import { sb } from '../lib/supabase.js';

export default function AssignTaskPanel({ active }) {
  const { currentUser, loadProfiles } = useAuth();
  const { profiles } = useProfiles();

  const [assignee, setAssignee] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (active) loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const people = useMemo(() => [...new Set(profiles.map(p => p.username))].sort(), [profiles]);

  const assignTask = async () => {
    if (!assignee || !title.trim()) {
      setStatus('Choose a person and enter a task title.');
      return;
    }
    try {
      const { data, error } = await sb.from('tasks').insert({
        title: title.trim(), description,
        due_date: dueDate || null,
        priority,
        assignee,
        assigned_by: currentUser,
        status: 'Assigned',
        assigned_at: new Date().toISOString()
      }).select('ticket_id').single();
      if (error) throw error;
      setStatus(`Task ${data.ticket_id} assigned to ${assignee}.`);
      setTitle('');
      setDescription('');
      setDueDate('');
      setTimeout(() => setStatus(''), 2500);
    } catch (e) {
      setStatus('Error assigning task: ' + e.message);
    }
  };

  return (
    <div className={`panel ${active ? 'active' : ''}`} id="panel-assigntask">
      <div className="sheet">
        <div className="section-title" style={{ marginBottom: 4 }}>Assign a new task</div>
        <div className="section-hint">Give it a clear title so the assignee knows exactly what's expected.</div>
        <div className="meta-row">
          <div className="meta-field">
            <label>Assign to</label>
            <select id="taskAssignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">— choose person —</option>
              {people.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="meta-field">
            <label>Due date (optional)</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="meta-field">
            <label>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="Normal">Normal</option>
              <option value="High">High</option>
              <option value="Low">Low</option>
            </select>
          </div>
        </div>
        <section className="first">
          <div className="section-title">Task title</div>
          <input
            type="text"
            placeholder="e.g. Set up staging environment"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14 }}
          />
        </section>
        <section>
          <div className="section-title">Description</div>
          <textarea placeholder="Details, links, acceptance criteria..." value={description} onChange={(e) => setDescription(e.target.value)} />
        </section>
        <div className="actions">
          <button className="btn-primary" onClick={assignTask}>Assign Task</button>
        </div>
        <div className="status" id="assignTaskStatus">{status}</div>
      </div>
    </div>
  );
}
