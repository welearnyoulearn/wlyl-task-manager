import { useEffect, useMemo, useState } from 'react';
import {
  LayoutGrid, Clock, Circle, PlayCircle, PauseCircle, CheckCircle2, Archive,
  CircleDot, FlaskConical, Beaker, XCircle, AlertTriangle
} from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import TaskCard from './TaskCard.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';

// Same color meaning as TaskCard's STATUS_COLORS / QA_BADGE_VARIANT -
// kept in sync manually since these live in different files, but the
// hex values are the same ones already used for the status dot / QA
// badge elsewhere on a ticket, so a colored summary card here matches
// what a ticket itself shows.
const STATUS_CARD_STYLE = {
  Assigned: { color: '#b57519', bg: '#FCF1DE', icon: Clock },
  'Not Started': { color: '#6b6b6b', bg: '#ECEAE3', icon: Circle },
  'In Progress': { color: '#1F8A70', bg: '#E9F4F0', icon: PlayCircle },
  'On Hold': { color: '#a83232', bg: '#fbeceb', icon: PauseCircle },
  Done: { color: '#124F41', bg: '#E9F4F0', icon: CheckCircle2 },
  Closed: { color: '#4a5a55', bg: '#ECEAE3', icon: Archive }
};

const QA_CARD_STYLE = {
  'Not Ready': { color: '#6B7570', bg: '#ECEAE3', icon: CircleDot },
  'Ready for QA': { color: '#9C6A16', bg: '#FCF1DE', icon: FlaskConical },
  'In QA': { color: '#9C6A16', bg: '#FCF1DE', icon: Beaker },
  Passed: { color: '#124F41', bg: '#E9F4F0', icon: CheckCircle2 },
  Failed: { color: '#a83232', bg: '#fbeceb', icon: XCircle }
};

function SummaryCard({ value, label, active, onClick, color, bg, icon: Icon }) {
  return (
    <button
      type="button"
      className={cn('summary-card summary-card-clickable', active && 'summary-card-active')}
      style={color ? { '--card-color': color, '--card-bg': bg } : undefined}
      onClick={onClick}
    >
      {Icon && (
        <div className="summary-card-icon">
          <Icon size={16} strokeWidth={2.3} />
        </div>
      )}
      <div className="num-big">{value}</div>
      <div className="cap">{label}</div>
    </button>
  );
}

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

// A ticket counts as overdue when its due_date has passed and it
// isn't finished yet - Done/Closed tickets don't keep aging into
// "overdue" once the work is actually complete. Matches the same
// still-in-flight statuses the due-date-reminders Edge Function
// treats as "still owed" (see supabase/functions/due-date-reminders).
function isOverdue(task) {
  if (!task.dueDate || task.status === 'Done' || task.status === 'Closed') return false;
  return task.dueDate < new Date().toISOString().slice(0, 10);
}

export default function TasksBoardPanel({ active }) {
  const { allTasks, loadAllTasks } = useData();
  const { loadProfiles } = useAuth();
  const [personFilter, setPersonFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [qaStatusFilter, setQaStatusFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
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
    if (overdueOnly) f = f.filter(isOverdue);
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
  }, [allTasks, personFilter, statusFilter, qaStatusFilter, overdueOnly, sortBy, search]);

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
    closed: allTasks.filter(t => t.status === 'Closed' && (!personFilter || t.assignee === personFilter)).length,
    overdue: scoped.filter(isOverdue).length
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
  const toggleOverdueOnly = () => setOverdueOnly(prev => !prev);

  return (
    <div className={`panel ${active ? 'active' : ''}`} id="panel-tasksboard">
      <div className="summary-row" id="taskSummaryRow">
        <SummaryCard value={counts.total} label="Total tasks" icon={LayoutGrid}
          active={statusFilter === ''} onClick={() => setStatusFilter('')} />
        <SummaryCard value={counts.awaitingAccept} label="Awaiting accept" {...STATUS_CARD_STYLE.Assigned}
          active={statusFilter === 'Assigned'} onClick={() => toggleStatusFilter('Assigned')} />
        <SummaryCard value={counts.notStarted} label="Not started" {...STATUS_CARD_STYLE['Not Started']}
          active={statusFilter === 'Not Started'} onClick={() => toggleStatusFilter('Not Started')} />
        <SummaryCard value={counts.inProgress} label="In progress" {...STATUS_CARD_STYLE['In Progress']}
          active={statusFilter === 'In Progress'} onClick={() => toggleStatusFilter('In Progress')} />
        <SummaryCard value={counts.onHold} label="On Hold" {...STATUS_CARD_STYLE['On Hold']}
          active={statusFilter === 'On Hold'} onClick={() => toggleStatusFilter('On Hold')} />
        <SummaryCard value={counts.done} label="Done" {...STATUS_CARD_STYLE.Done}
          active={statusFilter === 'Done'} onClick={() => toggleStatusFilter('Done')} />
        <SummaryCard value={counts.closed} label="Closed" {...STATUS_CARD_STYLE.Closed}
          active={statusFilter === 'Closed'} onClick={() => toggleStatusFilter('Closed')} />
        <SummaryCard value={counts.overdue} label="Overdue" color="#a83232" bg="#fbeceb" icon={AlertTriangle}
          active={overdueOnly} onClick={toggleOverdueOnly} />
      </div>
      <div className="summary-row" id="qaSummaryRow">
        <SummaryCard value={qaCounts.notReady} label="QA: Not ready" {...QA_CARD_STYLE['Not Ready']}
          active={qaStatusFilter === 'Not Ready'} onClick={() => toggleQaStatusFilter('Not Ready')} />
        <SummaryCard value={qaCounts.readyForQa} label="QA: Ready for QA" {...QA_CARD_STYLE['Ready for QA']}
          active={qaStatusFilter === 'Ready for QA'} onClick={() => toggleQaStatusFilter('Ready for QA')} />
        <SummaryCard value={qaCounts.inQa} label="QA: In QA" {...QA_CARD_STYLE['In QA']}
          active={qaStatusFilter === 'In QA'} onClick={() => toggleQaStatusFilter('In QA')} />
        <SummaryCard value={qaCounts.passed} label="QA: Passed" {...QA_CARD_STYLE.Passed}
          active={qaStatusFilter === 'Passed'} onClick={() => toggleQaStatusFilter('Passed')} />
        <SummaryCard value={qaCounts.failed} label="QA: Failed" {...QA_CARD_STYLE.Failed}
          active={qaStatusFilter === 'Failed'} onClick={() => toggleQaStatusFilter('Failed')} />
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
