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
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const STATUS_COLORS = {
  Assigned: '#b57519', 'Not Started': '#6b6b6b', 'In Progress': '#1F8A70', Blocked: '#a83232', Done: '#124F41'
};

const STATUS_OPTIONS = ['Not Started', 'In Progress', 'Blocked', 'Done'];

const QA_BADGE_VARIANT = {
  'Not Ready': 'qaNotReady',
  'Ready for QA': 'qaReady',
  'In QA': 'qaReady',
  Passed: 'qaPassed',
  Failed: 'qaFailed'
};

export default function TaskCard({ task, showAssignee, onChanged, needsAction }) {
  const { openTicketDetail } = useTicketDetail();
  const { loadAllTasks } = useData();
  const { currentUser, currentUserId, isAdmin, currentMemberRole } = useAuth();
  const { profiles } = useProfiles();
  const { toast } = useToast();

  const [showBugForm, setShowBugForm] = useState(false); // 'fail' | 'standalone' | false
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const [showAssignQa, setShowAssignQa] = useState(false);
  const [showTestPlanForm, setShowTestPlanForm] = useState(false);
  const [testPlanDraft, setTestPlanDraft] = useState('');
  const [testPlanError, setTestPlanError] = useState('');
  const [busy, setBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

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

  // qa_assignee routing is now mandatory, not optional: Start QA is
  // blocked until an admin has assigned a specific tester via Assign QA
  // - self-pick is no longer possible, even for a fully qualified
  // tester. Once In QA or later, the ticket no longer needs qa_assignee
  // to keep being actionable by that same person (canDoQaActionsForThisTicket
  // still checks isQaAssignee for Pass/Fail QA).
  const isQaAssignee = task.qaAssignee && task.qaAssignee === currentUserId;
  const canDoQaActionsForThisTicket = canDoQaActions && (isQaAssignee || isAdmin);

  const canMarkReadyForQa = canDoDevActions && task.status === 'Done' && (qaStatus === 'Not Ready' || qaStatus === 'Failed');
  const canStartQa = canDoQaActionsForThisTicket && qaStatus === 'Ready for QA' && !!task.qaAssignee;
  const canResolveQa = canDoQaActionsForThisTicket && qaStatus === 'In QA';

  const qualifiedTesters = profiles.filter(p => !p.is_admin && (p.member_role === 'tester' || p.member_role === 'both'));

  const refresh = async () => {
    await loadAllTasks();
    onChanged && onChanged();
  };

  const acceptTask = async () => {
    setBusy(true);
    try {
      const { error } = await sb.from('tasks').update({
        status: 'Not Started',
        accepted_at: new Date().toISOString()
      }).eq('id', task.key);
      if (error) throw error;
      await refresh();
      toast({ description: `${task.ticketId} accepted.` });
    } catch (e) {
      toast({ variant: 'destructive', description: 'Could not accept task: ' + e.message });
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = async (status) => {
    setBusy(true);
    try {
      const { error } = await sb.from('tasks').update({ status }).eq('id', task.key);
      if (error) throw error;
      await refresh();
      toast({ description: `${task.ticketId} status: ${status}.` });
    } catch (e) {
      toast({ variant: 'destructive', description: 'Could not update status: ' + e.message });
    } finally {
      setBusy(false);
    }
  };

  const deleteTask = async () => {
    setBusy(true);
    try {
      const { error } = await sb.from('tasks').delete().eq('id', task.key);
      if (error) throw error;
      await refresh();
      toast({ description: `${task.ticketId} deleted.` });
    } catch (e) {
      toast({ variant: 'destructive', description: 'Could not delete: ' + e.message });
    } finally {
      setBusy(false);
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
      toast({ variant: 'destructive', description: 'Could not post comment: ' + e.message });
    }
  };

  const openTestPlanForm = () => {
    setTestPlanDraft(task.testPlan || '');
    setTestPlanError('');
    setShowTestPlanForm(true);
  };

  // A test plan is mandatory to mark a ticket Ready for QA - the dev
  // provides it here, in the same request that flips qa_status, and it
  // stays attached to the ticket afterward (task.testPlan) so whoever
  // ends up as qa_assignee sees it on the card automatically, without
  // any separate "share" step. Enforced at the DB layer too, not just by
  // this dialog requiring the field - see supabase/012_test_plan.sql.
  const submitTestPlanAndMarkReady = async () => {
    if (!testPlanDraft.trim()) {
      setTestPlanError('A test plan is required before this ticket can go to QA.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await sb.from('tasks').update({
        qa_status: 'Ready for QA',
        test_plan: testPlanDraft.trim()
      }).eq('id', task.key);
      if (error) throw error;
      setShowTestPlanForm(false);
      await refresh();
      toast({ description: `${task.ticketId} marked Ready for QA.` });
    } catch (e) {
      toast({ variant: 'destructive', description: 'Could not update QA status: ' + e.message });
    } finally {
      setBusy(false);
    }
  };

  const startQa = async () => {
    setBusy(true);
    try {
      const { error } = await sb.from('tasks').update({ qa_status: 'In QA' }).eq('id', task.key);
      if (error) throw error;
      await refresh();
      toast({ description: `${task.ticketId} QA started.` });
    } catch (e) {
      toast({ variant: 'destructive', description: 'Could not update QA status: ' + e.message });
    } finally {
      setBusy(false);
    }
  };

  const assignQa = async (profileId) => {
    setBusy(true);
    try {
      const { error } = await sb.from('tasks').update({ qa_assignee: profileId || null }).eq('id', task.key);
      if (error) throw error;
      setShowAssignQa(false);
      await refresh();
      const assignee = profiles.find(p => p.id === profileId);
      toast({ description: assignee ? `${task.ticketId} QA assigned to ${assignee.username}.` : `${task.ticketId} QA assignment cleared.` });
    } catch (e) {
      toast({ variant: 'destructive', description: 'Could not assign QA: ' + e.message });
    } finally {
      setBusy(false);
    }
  };

  const passQa = async () => {
    setBusy(true);
    try {
      const updates = { qa_status: 'Passed' };
      if (task.status !== 'Done') updates.status = 'Done';
      const { error } = await sb.from('tasks').update(updates).eq('id', task.key);
      if (error) throw error;
      await refresh();
      toast({ description: `${task.ticketId} QA passed.` });
    } catch (e) {
      toast({ variant: 'destructive', description: 'Could not update QA status: ' + e.message });
    } finally {
      setBusy(false);
    }
  };

  const unresolvedBugs = (task.bugReports || []).filter(b => !b.resolved);
  const resolvedBugs = (task.bugReports || []).filter(b => b.resolved);

  return (
    <Card className="entry-card mb-3">
      <CardContent className="p-4">
        <div className="entry-head">
          <span className="entry-name">
            {needsAction && (
              <Badge variant="destructive" className="mr-2 align-middle">Needs action</Badge>
            )}
            <span className="ticket-link" onClick={() => openTicketDetail(task.ticketId || '')}>{task.ticketId || ''}</span>
            &nbsp;{task.title} {showAssignee && (
              <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}> &rarr; {task.assignee}</span>
            )}
            {task.qaAssigneeUsername && (
              <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}> &middot; QA: {task.qaAssigneeUsername}</span>
            )}
            {!task.qaAssignee && qaStatus === 'Ready for QA' && (
              <span style={{ fontWeight: 600, color: 'var(--danger)', fontSize: 12 }}> &middot; QA: unassigned</span>
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
        {task.testPlan && (
          <div className="entry-block">
            <div className="label">Test plan</div>
            <pre>{task.testPlan}</pre>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '10px 0', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: STATUS_COLORS[task.status] || '#6b6b6b' }}>
            &#9679; {task.status}
          </span>
          <Badge variant={QA_BADGE_VARIANT[qaStatus] || 'qaNotReady'}>QA: {qaStatus}</Badge>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Priority: {task.priority || 'Normal'}</span>
          {!canDoDevActions ? null : needsAccept ? (
            <Button size="sm" onClick={acceptTask} disabled={busy}>Accept Task</Button>
          ) : (
            <NativeSelect
              className="h-auto w-auto py-1 px-2 text-xs"
              value={task.status}
              onChange={(e) => updateStatus(e.target.value)}
              disabled={busy}
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </NativeSelect>
          )}
          {showAssignee && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">Delete</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this ticket?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes {task.ticketId} — {task.title}. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={deleteTask}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0', flexWrap: 'wrap' }}>
          {canMarkReadyForQa && (
            <Button variant="secondary" size="sm" onClick={openTestPlanForm} disabled={busy}>Mark Ready for QA</Button>
          )}
          {isAdmin && qaStatus === 'Ready for QA' && !showAssignQa && (
            <Button
              variant={task.qaAssignee ? 'secondary' : 'destructive'}
              size="sm"
              onClick={() => setShowAssignQa(true)}
            >
              {task.qaAssignee ? 'Reassign QA' : 'Assign QA (required)'}
            </Button>
          )}
          {showAssignQa && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <NativeSelect
                className="h-auto w-auto py-1 px-2 text-xs"
                defaultValue={task.qaAssignee || ''}
                onChange={(e) => { if (e.target.value) assignQa(e.target.value); }}
                disabled={busy}
              >
                <option value="" disabled>— choose a tester (required) —</option>
                {qualifiedTesters.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
              </NativeSelect>
              <Button variant="ghost" size="sm" onClick={() => setShowAssignQa(false)}>Cancel</Button>
            </span>
          )}
          {canStartQa && (
            <Button variant="secondary" size="sm" onClick={startQa} disabled={busy}>Start QA</Button>
          )}
          {canResolveQa && (
            <>
              <Button size="sm" onClick={passQa} disabled={busy}>Pass QA</Button>
              <Button variant="destructive" size="sm" onClick={() => setShowBugForm('fail')} disabled={busy}>Fail QA</Button>
            </>
          )}
          {/* Report Bug / Attach Test Run are QA-side actions - a
              developer-only member never sees them on any ticket,
              regardless of status, same as Start/Pass/Fail QA above. */}
          {canDoQaActions && showBugForm !== 'fail' && (
            <Button variant="ghost" size="sm" onClick={() => setShowBugForm('standalone')}>Report Bug</Button>
          )}
          {canDoQaActions && (
            <Button variant="ghost" size="sm" onClick={() => setShowEvidenceForm(true)}>Attach Test Run</Button>
          )}
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

        <Dialog open={showTestPlanForm} onOpenChange={(open) => { if (!open) setShowTestPlanForm(false); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Test plan required</DialogTitle>
              <DialogDescription>
                {task.ticketId} — {task.title}. A test plan is mandatory before this ticket can move to Ready for QA; whoever it's assigned to for QA will see it on the ticket.
              </DialogDescription>
            </DialogHeader>
            <div>
              <Textarea
                placeholder={'What should QA verify? Steps, scenarios, edge cases...'}
                value={testPlanDraft}
                onChange={(e) => setTestPlanDraft(e.target.value)}
                rows={6}
              />
              {testPlanError && <div className="text-xs text-destructive mt-1">{testPlanError}</div>}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowTestPlanForm(false)} disabled={busy}>Cancel</Button>
              <Button onClick={submitTestPlanAndMarkReady} disabled={busy}>Submit & Mark Ready for QA</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {(() => {
          const evidenceCount = (task.testEvidence || []).length;
          const bugCount = unresolvedBugs.length + resolvedBugs.length;
          const hasCollapsibleDetail = evidenceCount + bugCount > 0;
          // Bug reports and test evidence are collapsed behind a toggle
          // by default - they're the bulkiest content on a card (full
          // repro steps, severity, environment, per-run pass/fail
          // counts) and mostly historical once resolved. Comments stay
          // always visible - short, and usually the most relevant
          // signal ("what's the latest on this ticket"), plus the
          // comment input needs to always be reachable without an extra
          // click. Genuinely collapsed by default, no auto-open based
          // on content - auto-opening whenever a bug/evidence exists
          // would mean it never actually collapses for any ticket
          // that's been through QA once, which defeats the point.
          const open = detailsOpen;
          return (
            <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
              {hasCollapsibleDetail && !open && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 mb-2 text-xs"
                  onClick={() => setDetailsOpen(true)}
                >
                  Show details ({[
                    bugCount > 0 && `${bugCount} bug report${bugCount === 1 ? '' : 's'}`,
                    evidenceCount > 0 && `${evidenceCount} test run${evidenceCount === 1 ? '' : 's'}`
                  ].filter(Boolean).join(', ')})
                </Button>
              )}
              {hasCollapsibleDetail && open && (
                <>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 mb-2 text-xs text-muted-foreground"
                    onClick={() => setDetailsOpen(false)}
                  >
                    Hide details
                  </Button>
                  {evidenceCount > 0 && (
                    <div style={{ margin: '4px 0 12px' }}>
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
                    <div style={{ margin: '4px 0 12px' }}>
                      <div className="section-title" style={{ fontSize: 13 }}>Open bug reports</div>
                      {unresolvedBugs.map(b => <BugReportCard key={b.key} bug={b} task={task} />)}
                    </div>
                  )}
                  {resolvedBugs.length > 0 && (
                    <div style={{ margin: '4px 0 12px' }}>
                      <div className="section-title" style={{ fontSize: 13 }}>Resolved bug reports</div>
                      {resolvedBugs.map(b => <BugReportCard key={b.key} bug={b} task={task} />)}
                    </div>
                  )}
                </>
              )}
              <CommentThread comments={task.comments} onPost={postComment} />
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}
