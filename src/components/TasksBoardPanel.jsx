import { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import TaskCard from './TaskCard.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'Assigned', label: 'Assigned (awaiting accept)' },
  { value: 'Not Started', label: 'Not Started' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'On Hold', label: 'On Hold' },
  { value: 'Done', label: 'Done' }
];

const QA_STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'Not Ready', label: 'Not Ready' },
  { value: 'Ready for QA', label: 'Ready for QA' },
  { value: 'In QA', label: 'In QA' },
  { value: 'Passed', label: 'Passed' },
  { value: 'Failed', label: 'Failed' }
];

const SORT_OPTIONS = [
  { value: 'created', label: 'Newest first' },
  { value: 'updated', label: 'Last updated' }
];

export default function TasksBoardPanel({ active }) {
  const { allTasks, loadAllTasks } = useData();
  const { loadProfiles } = useAuth();
  const [personFilter, setPersonFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [qaStatusFilter, setQaStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('created');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (active) {
      loadAllTasks();
      // TaskCard's "Assign QA" picker needs profiles (with member_role)
      // loaded to list qualified testers - previously only loaded by
      // AssignTaskPanel/ManageMembersPanel/ManageAdminsPanel, so an
      // admin landing directly on Tasks Board without visiting one of
      // those first would see an empty picker. Found via
      // qa-assignment.spec.js actually exercising a fresh admin session.
      loadProfiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const people = useMemo(() => [...new Set(allTasks.map(t => t.assignee))].sort(), [allTasks]);

  const filtered = useMemo(() => {
    let f = allTasks;
    if (personFilter) f = f.filter(t => t.assignee === personFilter);
    if (statusFilter) f = f.filter(t => t.status === statusFilter);
    if (qaStatusFilter) f = f.filter(t => (t.qaStatus || 'Not Ready') === qaStatusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      f = f.filter(t => t.ticketId?.toLowerCase().includes(q) || t.title?.toLowerCase().includes(q));
    }
    if (sortBy === 'updated') {
      f = [...f].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    }
    // 'created' needs no explicit sort: allTasks already arrives ordered
    // by created_at desc from loadAllTasks, and filtering preserves order.
    return f;
  }, [allTasks, personFilter, statusFilter, qaStatusFilter, sortBy, search]);

  const counts = useMemo(() => ({
    total: filtered.length,
    awaitingAccept: filtered.filter(t => t.status === 'Assigned').length,
    notStarted: filtered.filter(t => t.status === 'Not Started').length,
    inProgress: filtered.filter(t => t.status === 'In Progress').length,
    onHold: filtered.filter(t => t.status === 'On Hold').length,
    done: filtered.filter(t => t.status === 'Done').length
  }), [filtered]);

  const qaCounts = useMemo(() => ({
    notReady: filtered.filter(t => (t.qaStatus || 'Not Ready') === 'Not Ready').length,
    readyForQa: filtered.filter(t => t.qaStatus === 'Ready for QA').length,
    inQa: filtered.filter(t => t.qaStatus === 'In QA').length,
    passed: filtered.filter(t => t.qaStatus === 'Passed').length,
    failed: filtered.filter(t => t.qaStatus === 'Failed').length
  }), [filtered]);

  return (
    <div className={`panel ${active ? 'active' : ''}`} id="panel-tasksboard">
      <div className="summary-row" id="taskSummaryRow">
        <div className="summary-card"><div className="num-big">{counts.total}</div><div className="cap">Total tasks</div></div>
        <div className="summary-card"><div className="num-big">{counts.awaitingAccept}</div><div className="cap">Awaiting accept</div></div>
        <div className="summary-card"><div className="num-big">{counts.notStarted}</div><div className="cap">Not started</div></div>
        <div className="summary-card"><div className="num-big">{counts.inProgress}</div><div className="cap">In progress</div></div>
        <div className="summary-card"><div className="num-big">{counts.onHold}</div><div className="cap">On Hold</div></div>
        <div className="summary-card"><div className="num-big">{counts.done}</div><div className="cap">Done</div></div>
      </div>
      <div className="summary-row" id="qaSummaryRow">
        <div className="summary-card"><div className="num-big">{qaCounts.notReady}</div><div className="cap">QA: Not ready</div></div>
        <div className="summary-card"><div className="num-big">{qaCounts.readyForQa}</div><div className="cap">QA: Ready for QA</div></div>
        <div className="summary-card"><div className="num-big">{qaCounts.inQa}</div><div className="cap">QA: In QA</div></div>
        <div className="summary-card"><div className="num-big">{qaCounts.passed}</div><div className="cap">QA: Passed</div></div>
        <div className="summary-card"><div className="num-big">{qaCounts.failed}</div><div className="cap">QA: Failed</div></div>
      </div>
      <div className="filter-row">
        <div className="filter-field" style={{ minWidth: 200 }}>
          <Label>Search</Label>
          <Input
            type="text"
            placeholder="Ticket ID or title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-field">
          <Label>Person</Label>
          <NativeSelect value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}>
            <option value="">All</option>
            {people.map(p => <option key={p} value={p}>{p}</option>)}
          </NativeSelect>
        </div>
        <div className="filter-field">
          <Label>Status</Label>
          <NativeSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {STATUS_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </NativeSelect>
        </div>
        <div className="filter-field">
          <Label>QA Status</Label>
          <NativeSelect value={qaStatusFilter} onChange={(e) => setQaStatusFilter(e.target.value)}>
            {QA_STATUS_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </NativeSelect>
        </div>
        <div className="filter-field">
          <Label>Sort by</Label>
          <NativeSelect value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </NativeSelect>
        </div>
        <div className="filter-field">
          <Label style={{ visibility: 'hidden' }}>go</Label>
          <Button variant="secondary" onClick={loadAllTasks}>Refresh</Button>
        </div>
      </div>
      <div id="tasksBoardList">
        {filtered.length === 0
          ? <div className="empty">No tasks yet. Use "Assign Task" to create one.</div>
          : filtered.map(t => <TaskCard key={t.key} task={t} showAssignee={true} />)}
      </div>
    </div>
  );
}
