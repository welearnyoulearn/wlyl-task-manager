import { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import TaskCard from './TaskCard.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'Assigned', label: 'Assigned (awaiting accept)' },
  { value: 'Not Started', label: 'Not Started' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'On Hold', label: 'On Hold' },
  { value: 'Done', label: 'Done' },
  { value: 'Closed', label: 'Closed' }
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
    // Closed tickets are archived work (deployed, locked) - they'd
    // otherwise sit at the top of "Newest first" forever and crowd out
    // active tickets. Hidden by default, same as any other status
    // filter would hide them - explicitly selecting "Closed" in the
    // Status filter (including via clicking the Closed summary card)
    // is the only way to see them.
    if (statusFilter !== 'Closed') f = f.filter(t => t.status !== 'Closed');
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

  // Counts/cards are computed from allTasks (minus Closed, for the same
  // reason as the list above) rather than from `filtered` - a summary
  // card is meant to answer "how many tickets are in this status
  // overall", not shrink every time another card is clicked, which
  // would make clicking one card change the numbers on the others.
  const scoped = useMemo(() => {
    let f = allTasks.filter(t => t.status !== 'Closed');
    if (personFilter) f = f.filter(t => t.assignee === personFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      f = f.filter(t => t.ticketId?.toLowerCase().includes(q) || t.title?.toLowerCase().includes(q));
    }
    return f;
  }, [allTasks, personFilter, search]);

  const counts = useMemo(() => ({
    total: scoped.length,
    awaitingAccept: scoped.filter(t => t.status === 'Assigned').length,
    notStarted: scoped.filter(t => t.status === 'Not Started').length,
    inProgress: scoped.filter(t => t.status === 'In Progress').length,
    onHold: scoped.filter(t => t.status === 'On Hold').length,
    done: scoped.filter(t => t.status === 'Done').length,
    closed: allTasks.filter(t => t.status === 'Closed' && (!personFilter || t.assignee === personFilter)).length
  }), [scoped, allTasks, personFilter]);

  const qaCounts = useMemo(() => ({
    notReady: scoped.filter(t => (t.qaStatus || 'Not Ready') === 'Not Ready').length,
    readyForQa: scoped.filter(t => t.qaStatus === 'Ready for QA').length,
    inQa: scoped.filter(t => t.qaStatus === 'In QA').length,
    passed: scoped.filter(t => t.qaStatus === 'Passed').length,
    failed: scoped.filter(t => t.qaStatus === 'Failed').length
  }), [scoped]);

  // Clicking an active card again clears that filter back to "All" -
  // otherwise there'd be no way to get back to the unfiltered view
  // without using the Status dropdown separately.
  const toggleStatusFilter = (value) => setStatusFilter(prev => (prev === value ? '' : value));
  const toggleQaStatusFilter = (value) => setQaStatusFilter(prev => (prev === value ? '' : value));

  return (
    <div className={`panel ${active ? 'active' : ''}`} id="panel-tasksboard">
      <div className="summary-row" id="taskSummaryRow">
        <button type="button" className={cn('summary-card summary-card-clickable', statusFilter === '' && 'summary-card-active')} onClick={() => setStatusFilter('')}>
          <div className="num-big">{counts.total}</div><div className="cap">Total tasks</div>
        </button>
        <button type="button" className={cn('summary-card summary-card-clickable', statusFilter === 'Assigned' && 'summary-card-active')} onClick={() => toggleStatusFilter('Assigned')}>
          <div className="num-big">{counts.awaitingAccept}</div><div className="cap">Awaiting accept</div>
        </button>
        <button type="button" className={cn('summary-card summary-card-clickable', statusFilter === 'Not Started' && 'summary-card-active')} onClick={() => toggleStatusFilter('Not Started')}>
          <div className="num-big">{counts.notStarted}</div><div className="cap">Not started</div>
        </button>
        <button type="button" className={cn('summary-card summary-card-clickable', statusFilter === 'In Progress' && 'summary-card-active')} onClick={() => toggleStatusFilter('In Progress')}>
          <div className="num-big">{counts.inProgress}</div><div className="cap">In progress</div>
        </button>
        <button type="button" className={cn('summary-card summary-card-clickable', statusFilter === 'On Hold' && 'summary-card-active')} onClick={() => toggleStatusFilter('On Hold')}>
          <div className="num-big">{counts.onHold}</div><div className="cap">On Hold</div>
        </button>
        <button type="button" className={cn('summary-card summary-card-clickable', statusFilter === 'Done' && 'summary-card-active')} onClick={() => toggleStatusFilter('Done')}>
          <div className="num-big">{counts.done}</div><div className="cap">Done</div>
        </button>
        <button type="button" className={cn('summary-card summary-card-clickable', statusFilter === 'Closed' && 'summary-card-active')} onClick={() => toggleStatusFilter('Closed')}>
          <div className="num-big">{counts.closed}</div><div className="cap">Closed</div>
        </button>
      </div>
      <div className="summary-row" id="qaSummaryRow">
        <button type="button" className={cn('summary-card summary-card-clickable', qaStatusFilter === 'Not Ready' && 'summary-card-active')} onClick={() => toggleQaStatusFilter('Not Ready')}>
          <div className="num-big">{qaCounts.notReady}</div><div className="cap">QA: Not ready</div>
        </button>
        <button type="button" className={cn('summary-card summary-card-clickable', qaStatusFilter === 'Ready for QA' && 'summary-card-active')} onClick={() => toggleQaStatusFilter('Ready for QA')}>
          <div className="num-big">{qaCounts.readyForQa}</div><div className="cap">QA: Ready for QA</div>
        </button>
        <button type="button" className={cn('summary-card summary-card-clickable', qaStatusFilter === 'In QA' && 'summary-card-active')} onClick={() => toggleQaStatusFilter('In QA')}>
          <div className="num-big">{qaCounts.inQa}</div><div className="cap">QA: In QA</div>
        </button>
        <button type="button" className={cn('summary-card summary-card-clickable', qaStatusFilter === 'Passed' && 'summary-card-active')} onClick={() => toggleQaStatusFilter('Passed')}>
          <div className="num-big">{qaCounts.passed}</div><div className="cap">QA: Passed</div>
        </button>
        <button type="button" className={cn('summary-card summary-card-clickable', qaStatusFilter === 'Failed' && 'summary-card-active')} onClick={() => toggleQaStatusFilter('Failed')}>
          <div className="num-big">{qaCounts.failed}</div><div className="cap">QA: Failed</div>
        </button>
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
