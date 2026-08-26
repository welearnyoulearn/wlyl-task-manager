import { useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const SEVERITIES = ['Blocker', 'Major', 'Minor', 'Cosmetic'];

// Opened either from "Fail QA" (which also flips qa_status to Failed on
// submit) or from the standalone "Report Bug" button (which just logs the
// bug without touching qa_status) — see the `failsQa` prop. Rendered as a
// Dialog (Step 6, item 12) instead of the old always-inline form.
export default function BugReportForm({ task, failsQa, onClose }) {
  const { currentUser, currentUserId } = useAuth();
  const { loadAllTasks } = useData();
  const { toast } = useToast();

  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [expectedBehavior, setExpectedBehavior] = useState('');
  const [actualBehavior, setActualBehavior] = useState('');
  const [severity, setSeverity] = useState('Major');
  const [environment, setEnvironment] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const errors = {};
    if (!stepsToReproduce.trim()) errors.stepsToReproduce = 'Steps to reproduce are required.';
    if (!expectedBehavior.trim()) errors.expectedBehavior = 'Expected behavior is required.';
    if (!actualBehavior.trim()) errors.actualBehavior = 'Actual behavior is required.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setStatus('Please fix the highlighted fields.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: insertErr } = await sb.from('bug_reports').insert({
        task_id: task.key,
        reported_by: currentUser,
        reported_by_id: currentUserId,
        steps_to_reproduce: stepsToReproduce,
        expected_behavior: expectedBehavior,
        actual_behavior: actualBehavior,
        severity,
        environment: environment || null,
        evidence_url: evidenceUrl || null
      });
      if (insertErr) throw insertErr;

      if (failsQa) {
        const { error: updateErr } = await sb.from('tasks').update({ qa_status: 'Failed' }).eq('id', task.key);
        if (updateErr) throw updateErr;
      }

      await loadAllTasks();
      toast({ description: failsQa ? `${task.ticketId} failed QA — bug report logged.` : `Bug report logged on ${task.ticketId}.` });
      onClose();
    } catch (e) {
      setStatus('Could not submit bug report: ' + e.message);
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{failsQa ? 'Fail QA — bug report' : 'Report a bug'}</DialogTitle>
          <DialogDescription>{task.ticketId} — {task.title}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Steps to reproduce</Label>
            <Textarea value={stepsToReproduce} onChange={(e) => setStepsToReproduce(e.target.value)} placeholder={"1. Go to...\n2. Click..."} />
            {fieldErrors.stepsToReproduce && <div className="text-xs text-destructive mt-1">{fieldErrors.stepsToReproduce}</div>}
          </div>
          <div>
            <Label>Expected behavior</Label>
            <Textarea value={expectedBehavior} onChange={(e) => setExpectedBehavior(e.target.value)} />
            {fieldErrors.expectedBehavior && <div className="text-xs text-destructive mt-1">{fieldErrors.expectedBehavior}</div>}
          </div>
          <div>
            <Label>Actual behavior</Label>
            <Textarea value={actualBehavior} onChange={(e) => setActualBehavior(e.target.value)} />
            {fieldErrors.actualBehavior && <div className="text-xs text-destructive mt-1">{fieldErrors.actualBehavior}</div>}
          </div>
          <div className="meta-row">
            <div className="meta-field">
              <Label>Severity</Label>
              <NativeSelect value={severity} onChange={(e) => setSeverity(e.target.value)}>
                {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
              </NativeSelect>
            </div>
            <div className="meta-field">
              <Label>Environment (optional)</Label>
              <Input type="text" value={environment} onChange={(e) => setEnvironment(e.target.value)} placeholder="Chrome, desktop, preview URL" />
            </div>
          </div>
          <div>
            <Label>Evidence URL (optional)</Label>
            <Input type="text" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} placeholder="Screenshot, video, or trace link" />
          </div>
        </div>
        {status && <div className="text-sm text-destructive">{status}</div>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>
            {failsQa ? 'Submit and Fail QA' : 'Submit Bug Report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
