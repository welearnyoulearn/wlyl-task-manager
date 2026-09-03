import { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext.jsx';
import TaskCard from './TaskCard.jsx';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'Assigned', label: 'Assigned (awaiting accept)' },
  { value: 'Not Started', label: 'Not Started' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'On Hold', label: 'On Hold' },
  { value: 'Done', label: 'Done' },
  { value: 'Closed', label: 'Closed' }
];

// Admin-only view answering "what has THIS admin handed out, and to
// whom" - the mirror image of By Person (which groups by assignee).
// With more than one admin creating tickets, By Person alone can't
// answer "what did I personally assign" without mentally filtering a
// mixed list - this groups by tasks.assigned_by instead, which was
// already captured on every ticket (AssignTaskPanel.jsx sets it at
// creation) but had no view surfacing it.
export default function ByAdminPanel({ active }) {
  const { allTasks, loadAllTasks } = useData();
  const [admin, setAdmin] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    if (active) loadAllTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const admins = useMemo(() => [...new Set(allTasks.map(t => t.assignedBy).filter(Boolean))].sort(), [allTasks]);

  const allAdminTickets = useMemo(() => {
    if (!admin) return [];
    return allTasks.filter(t => t.assignedBy === admin);
  }, [allTasks, admin]);

  const tickets = useMemo(() => {
    return allAdminTickets
      .filter(t => !statusFilter || t.status === statusFilter)
      .sort((a, b) => (b.assignedAt || '').localeCompare(a.assignedAt || ''));
  }, [allAdminTickets, statusFilter]);

  // Per-assignee breakdown, unfiltered by status - this is the "easy
  // to understand at a glance" piece: who this admin has been handing
  // work to and how much, without opening every ticket.
  const byAssignee = useMemo(() => {
    const counts = new Map();
    for (const t of allAdminTickets) {
      counts.set(t.assignee, (counts.get(t.assignee) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [allAdminTickets]);

  const openCount = useMemo(
    () => allAdminTickets.filter(t => t.status !== 'Done' && t.status !== 'Closed').length,
    [allAdminTickets]
  );

  return (
    <div className={`panel ${active ? 'active' : ''}`} id="panel-byadmin">
      <div className="sheet" style={{ padding: 20 }}>
        <div className="filter-row" style={{ marginBottom: 0 }}>
          <div className="filter-field" style={{ flex: 1 }}>
            <Label>Select admin</Label>
            <NativeSelect value={admin} onChange={(e) => setAdmin(e.target.value)}>
              <option value="">— choose —</option>
              {admins.map(a => <option key={a} value={a}>{a}</option>)}
            </NativeSelect>
          </div>
          <div className="filter-field">
            <Label>Ticket status</Label>
            <NativeSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUS_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </NativeSelect>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        {!admin ? null : allAdminTickets.length === 0 ? (
          <div className="empty">This admin hasn't assigned any tickets yet.</div>
        ) : (
          <>
            <div className="summary-row">
              <div className="summary-card"><div className="num-big">{allAdminTickets.length}</div><div className="cap">Total assigned</div></div>
              <div className="summary-card"><div className="num-big">{openCount}</div><div className="cap">Still open</div></div>
              <div className="summary-card"><div className="num-big">{byAssignee.length}</div><div className="cap">People assigned to</div></div>
            </div>

            <div className="section-title" style={{ marginBottom: 10 }}>By assignee</div>
            <div className="card-chip-row" style={{ marginBottom: 24 }}>
              {byAssignee.map(([name, count]) => (
                <span key={name} className="chip chip-muted">{name} · {count}</span>
              ))}
            </div>

            <div className="section-title" style={{ marginBottom: 10 }}>Tickets</div>
            {tickets.length === 0 ? (
              <div className="empty">{statusFilter ? `No ${statusFilter} tickets from this admin.` : 'No tickets.'}</div>
            ) : tickets.map(t => <TaskCard key={t.key} task={t} showAssignee={true} />)}
          </>
        )}
      </div>
    </div>
  );
}
