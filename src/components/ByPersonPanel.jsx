import { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext.jsx';
import EntryCard from './EntryCard.jsx';
import TaskCard from './TaskCard.jsx';
import { Button } from '@/components/ui/button';
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

export default function ByPersonPanel({ active }) {
  const { allEntries, allTasks, loadAllEntries, loadAllTasks } = useData();
  const [person, setPerson] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    if (active) Promise.all([loadAllEntries(), loadAllTasks()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const people = useMemo(() => [...new Set([
    ...allEntries.map(e => e.name),
    ...allTasks.map(t => t.assignee)
  ])].sort(), [allEntries, allTasks]);

  const entries = useMemo(() => {
    if (!person) return [];
    return allEntries.filter(e => e.name === person).sort((a, b) => (b.weekOf || '').localeCompare(a.weekOf || ''));
  }, [allEntries, person]);

  const allPersonTickets = useMemo(() => {
    if (!person) return [];
    return allTasks.filter(t => t.assignee.toLowerCase() === person.toLowerCase());
  }, [allTasks, person]);

  const tickets = useMemo(() => {
    return allPersonTickets
      .filter(t => !statusFilter || t.status === statusFilter)
      .sort((a, b) => (b.acceptedAt || b.assignedAt || '').localeCompare(a.acceptedAt || a.assignedAt || ''));
  }, [allPersonTickets, statusFilter]);

  const totals = useMemo(() => ({
    catDev: entries.reduce((s, e) => s + (e.catDev || 0), 0),
    catResearch: entries.reduce((s, e) => s + (e.catResearch || 0), 0),
    catTesting: entries.reduce((s, e) => s + (e.catTesting || 0), 0),
    catDocs: entries.reduce((s, e) => s + (e.catDocs || 0), 0)
  }), [entries]);

  return (
    <div className={`panel ${active ? 'active' : ''}`} id="panel-byperson">
      <div className="sheet" style={{ padding: 20 }}>
        <div className="filter-row" style={{ marginBottom: 0 }}>
          <div className="filter-field" style={{ flex: 1 }}>
            <Label>Select person</Label>
            <NativeSelect value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">— choose —</option>
              {people.map(p => <option key={p} value={p}>{p}</option>)}
            </NativeSelect>
          </div>
          <div className="filter-field">
            <Label>Ticket status</Label>
            <NativeSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUS_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </NativeSelect>
          </div>
          <div className="filter-field">
            <Label style={{ visibility: 'hidden' }}>print</Label>
            <Button variant="secondary" onClick={() => window.print()}>Print summary</Button>
          </div>
        </div>
      </div>
      <div id="personEntries" style={{ marginTop: 16 }}>
        {!person ? null : (entries.length === 0 && allPersonTickets.length === 0) ? (
          <div className="empty">No updates or tickets for this person yet.</div>
        ) : (
          <>
            <div className="section-title" style={{ marginBottom: 10 }}>Weekly Reports</div>
            {entries.length === 0 ? (
              <div className="empty">No weekly reports submitted yet.</div>
            ) : (
              <>
                <div className="summary-row">
                  <div className="summary-card"><div className="num-big">{entries.length}</div><div className="cap">Weeks logged</div></div>
                  <div className="summary-card"><div className="num-big">{totals.catDev}</div><div className="cap">Development</div></div>
                  <div className="summary-card"><div className="num-big">{totals.catResearch}</div><div className="cap">Research</div></div>
                  <div className="summary-card"><div className="num-big">{totals.catTesting}</div><div className="cap">Testing</div></div>
                  <div className="summary-card"><div className="num-big">{totals.catDocs}</div><div className="cap">Documentation</div></div>
                </div>
                {entries.map(e => <EntryCard key={e.key} entry={e} />)}
              </>
            )}
            <div className="section-title" style={{ margin: '24px 0 10px' }}>Tickets</div>
            {tickets.length === 0 ? (
              <div className="empty">{statusFilter ? `No ${statusFilter} tickets for this person.` : 'No tickets assigned yet.'}</div>
            ) : tickets.map(t => <TaskCard key={t.key} task={t} showAssignee={false} />)}
          </>
        )}
      </div>
    </div>
  );
}
