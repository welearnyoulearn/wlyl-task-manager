import { useState } from 'react';
import CommentThread from './CommentThread.jsx';
import BugReportForm from './BugReportForm.jsx';
import TestEvidenceForm from './TestEvidenceForm.jsx';
import BugReportCard from './BugReportCard.jsx';
import { useTicketDetail } from '../context/TicketDetailContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useProfiles } from '../context/ProfilesContext.jsx';
import { sb } from '../lib/supabase.js';

const STATUS_COLORS = {
  Assigned: '#b57519', 'Not Started': '#6b6b6b', 'In Progress': '#1F8A70', Blocked: '#a83232', Done: '#124F41'
};

const STATUS_OPTIONS = ['Not Started', 'In Progress', 'Blocked', 'Done'];

const QA_BADGE_CLASS = {
  'Not Ready': 'qa-badge-not-ready',
  'Ready for QA': 'qa-badge-ready-for-qa',
  'In QA': 'qa-badge-in-qa',
  Passed: 'qa-badge-passed',
  Failed: 'qa-badge-failed'
};

export default function TaskCard({ task, showAssignee, onChanged }) {
  const { openTicketDetail } = useTicketDetail();
  const { loadAllTasks } = useData();
  const { currentUser, currentUserId, isAdmin, currentMemberRole } = useAuth();
  const { profiles } = useProfiles();

  const [showBugForm, setShowBugForm] = useState(false); // 'fail' | 'standalone' | false
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const [showAssignQa, setShowAssignQa] = useState(false);

  const needsAccept = task.status === 'Assigned';
  const qaStatus = task.qaStatus || 'Not Ready';

  // Role gating: admins can always act, regardless of member_role.
  // A member with no role set yet (null, before Phase 4's migration
  // backfill reaches them, or a role explicitly cleared) is treated as
  // unqualified for either side rather than defaulting to "both" here -
  // the migration's own default already makes 'both' the normal case,
  // so a genuinely null role is either an admin (fine, isAdmin covers
  // it) or a state that should be visibly "no access" rather than
  // silently permissive.
  const canDoDevActions = isAdmin || currentMemberRole === 'developer' || currentMemberRole === 'both';
  const canDoQaActions = isAdmin || currentMemberRole === 'tester' || currentMemberRole === 'both';

  // qa_assignee, when set, routes Start QA to that specific person (or
  // an admin) instead of any qualified tester - see README "QA
  // assignment". Unset (the default, and every ticket's state before
  // this feature) preserves the original self-pick behavior exactly.
  const isQaAssignee = task.qaAssignee && task.qaAssignee === currentUserId;
  const canDoQaActionsForThisTicket = canDoQaActions && (!task.qaAssignee || isQaAssignee || isAdmin);

  const canMarkReadyForQa = canDoDevActions && task.status === 'Done' && (qaStatus === 'Not Ready' || qaStatus === 'Failed');
  const canStartQa = canDoQaActionsForThisTicket && qaStatus === 'Ready for QA';
  const canResolveQa = canDoQaActionsForThisTicket && qaStatus === 'In QA';

  const qualifiedTesters = profiles.filter(p => !p.is_admin && (p.member_role === 'tester' || p.member_role === 'both'));

  const refresh = async () => {
    await loadAllTasks();
    onChanged && onChanged();
  };

  const acceptTask = async () => {
    try {
      const { error } = await sb.from('tasks').update({
        status: 'Not Started',
        accepted_at: new Date().toISOString()
      }).eq('id', task.key);
      if (error) throw error;
      await refresh();
    } catch (e) {
      alert('Could not accept task: ' + e.message);
    }
  };

  const updateStatus = async (status) => {
    try {
      const { error } = await sb.from('tasks').update({ status }).eq('id', task.key);
      if (error) throw error;
      await refresh();
    } catch (e) {
      alert('Could not update status: ' + e.message);
    }
  };

  const deleteTask = async () => {
    if (!confirm('Delete this task?')) return;
    try {
      const { error } = await sb.from('tasks').delete().eq('id', task.key);
      if (error) throw error;
      await refresh();
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
      await refresh();
    } catch (e) {
      alert('Could not post comment: ' + e.message);
    }
  };

  const markReadyForQa = async () => {
    try {
      const { error } = await sb.from('tasks').update({ qa_status: 'Ready for QA' }).eq('id', task.key);
      if (error) throw error;
      await refresh();
    } catch (e) {
      alert('Could not update QA status: ' + e.message);
    }
  };

  const startQa = async () => {
    try {
      const { error } = await sb.from('tasks').update({ qa_status: 'In QA' }).eq('id', task.key);
      if (error) throw error;
      await refresh();
    } catch (e) {
      alert('Could not update QA status: ' + e.message);
    }
  };

  const assignQa = async (profileId) => {
    try {
      const { error } = await sb.from('tasks').update({ qa_assignee: profileId || null }).eq('id', task.key);
      if (error) throw error;
      setShowAssignQa(false);
      await refresh();
    } catch (e) {
      alert('Could not assign QA: ' + e.message);
    }
  };

  const passQa = async () => {
    try {
      const updates = { qa_status: 'Passed' };
      if (task.status !== 'Done') updates.status = 'Done';
      const { error } = await sb.from('tasks').update(updates).eq('id', task.key);
      if (error) throw error;
      await refresh();
    } catch (e) {
      alert('Could not update QA status: ' + e.message);
    }
  };

  const unresolvedBugs = (task.bugReports || []).filter(b => !b.resolved);
  const resolvedBugs = (task.bugReports || []).filter(b => b.resolved);

  return (
    <div className="entry-card">
      <div className="entry-head">
        <span className="entry-name">
          <span className="ticket-link" onClick={() => openTicketDetail(task.ticketId || '')}>{task.ticketId || ''}</span>
          &nbsp;{task.title} {showAssignee && (
            <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}> &rarr; {task.assignee}</span>
          )}
          {task.qaAssigneeUsername && (
            <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}> &middot; QA: {task.qaAssigneeUsername}</span>
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
        <span className={`qa-badge ${QA_BADGE_CLASS[qaStatus] || ''}`}>QA: {qaStatus}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Priority: {task.priority || 'Normal'}</span>
        {!canDoDevActions ? null : needsAccept ? (
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

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0', flexWrap: 'wrap' }}>
        {canMarkReadyForQa && (
          <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={markReadyForQa}>Mark Ready for QA</button>
        )}
        {isAdmin && qaStatus === 'Ready for QA' && !showAssignQa && (
          <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => setShowAssignQa(true)}>
            {task.qaAssignee ? 'Reassign QA' : 'Assign QA'}
          </button>
        )}
        {showAssignQa && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <select
              defaultValue={task.qaAssignee || ''}
              onChange={(e) => assignQa(e.target.value)}
              style={{ fontSize: 12, padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 6 }}
            >
              <option value="">— any qualified tester —</option>
              {qualifiedTesters.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
            </select>
            <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setShowAssignQa(false)}>Cancel</button>
          </span>
        )}
        {canStartQa && (
          <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={startQa}>Start QA</button>
        )}
        {canResolveQa && (
          <>
            <button className="btn-primary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={passQa}>Pass QA</button>
            <button
              className="btn-secondary"
              style={{ padding: '6px 14px', fontSize: 12, color: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={() => setShowBugForm('fail')}
            >
              Fail QA
            </button>
          </>
        )}
        {showBugForm !== 'fail' && (
          <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => setShowBugForm('standalone')}>Report Bug</button>
        )}
        <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => setShowEvidenceForm(true)}>Attach Test Run</button>
      </div>

      {showBugForm && (
        <BugReportForm
          task={task}
          failsQa={showBugForm === 'fail'}
          onClose={() => setShowBugForm(false)}
        />
      )}
      {showEvidenceForm && (
        <TestEvidenceForm task={task} onClose={() => setShowEvidenceForm(false)} />
      )}

      {task.testEvidence && task.testEvidence.length > 0 && (
        <div style={{ margin: '12px 0' }}>
          {task.testEvidence.map(ev => (
            <div key={ev.key} className="test-evidence-row">
              <span>{ev.failedCount === 0 ? '✅' : '⚠️'}</span>
              <span>{ev.passedCount}/{ev.passedCount + ev.failedCount} passed</span>
              <a href={ev.runUrl} target="_blank" rel="noreferrer">run</a>
              <span style={{ color: 'var(--muted)' }}>{new Date(ev.createdAt).toLocaleDateString()}</span>
              {ev.notes && <span style={{ color: 'var(--muted)' }}>— {ev.notes}</span>}
            </div>
          ))}
        </div>
      )}

      {unresolvedBugs.length > 0 && (
        <div style={{ margin: '12px 0' }}>
          <div className="section-title" style={{ fontSize: 13 }}>Open bug reports</div>
          {unresolvedBugs.map(b => <BugReportCard key={b.key} bug={b} task={task} />)}
        </div>
      )}
      {resolvedBugs.length > 0 && (
        <div style={{ margin: '12px 0' }}>
          <div className="section-title" style={{ fontSize: 13 }}>Resolved bug reports</div>
          {resolvedBugs.map(b => <BugReportCard key={b.key} bug={b} task={task} />)}
        </div>
      )}

      <CommentThread comments={task.comments} onPost={postComment} />
    </div>
  );
}
