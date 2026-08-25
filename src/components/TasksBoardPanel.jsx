import { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext.jsx';
import TaskCard from './TaskCard.jsx';

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'Assigned', label: 'Assigned (awaiting accept)' },
  { value: 'Not Started', label: 'Not Started' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Blocked', label: 'Blocked' },
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

export default function TasksBoardPanel({ active }) {
  const { allTasks, loadAllTasks } = useData();
  const [personFilter, setPersonFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [qaStatusFilter, setQaStatusFilter] = useState('');

  useEffect(() => {
    if (active) loadAllTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const people = useMemo(() => [...new Set(allTasks.map(t => t.assignee))].sort(), [allTasks]);

  const filtered = useMemo(() => {
    let f = allTasks;
    if (personFilter) f = f.filter(t => t.assignee === personFilter);
    if (statusFilter) f = f.filter(t => t.status === statusFilter);
    if (qaStatusFilter) f = f.filter(t => (t.qaStatus || 'Not Ready') === qaStatusFilter);
    return f;
  }, [allTasks, personFilter, statusFilter, qaStatusFilter]);

  const counts = useMemo(() => ({
    total: filtered.length,
    awaitingAccept: filtered.filter(t => t.status === 'Assigned').length,
    notStarted: filtered.filter(t => t.status === 'Not Started').length,
    inProgress: filtered.filter(t => t.status === 'In Progress').length,
    blocked: filtered.filter(t => t.status === 'Blocked').length,
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
      <div className="summary-row">
        <div className="summary-card"><div className="num-big">{counts.total}</div><div className="cap">Total tasks</div></div>
        <div className="summary-card"><div className="num-big">{counts.awaitingAccept}</div><div className="cap">Awaiting accept</div></div>
        <div className="summary-card"><div className="num-big">{counts.notStarted}</div><div className="cap">Not started</div></div>
        <div className="summary-card"><div className="num-big">{counts.inProgress}</div><div className="cap">In progress</div></div>
        <div className="summary-card"><div className="num-big">{counts.blocked}</div><div className="cap">Blocked</div></div>
        <div className="summary-card"><div className="num-big">{counts.done}</div><div className="cap">Done</div></div>
      </div>
      <div className="summary-row">
        <div className="summary-card"><div className="num-big">{qaCounts.notReady}</div><div className="cap">QA: Not ready</div></div>
        <div className="summary-card"><div className="num-big">{qaCounts.readyForQa}</div><div className="cap">QA: Ready for QA</div></div>
        <div className="summary-card"><div className="num-big">{qaCounts.inQa}</div><div className="cap">QA: In QA</div></div>
        <div className="summary-card"><div className="num-big">{qaCounts.passed}</div><div className="cap">QA: Passed</div></div>
        <div className="summary-card"><div className="num-big">{qaCounts.failed}</div><div className="cap">QA: Failed</div></div>
      </div>
      <div className="filter-row">
        <div className="filter-field">
          <label>Person</label>
          <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}>
            <option value="">All</option>
            {people.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="filter-field">
          <label>Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {STATUS_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="filter-field">
          <label>QA Status</label>
          <select value={qaStatusFilter} onChange={(e) => setQaStatusFilter(e.target.value)}>
            {QA_STATUS_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="filter-field">
          <label style={{ visibility: 'hidden' }}>go</label>
          <button className="btn-secondary" onClick={loadAllTasks}>Refresh</button>
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
