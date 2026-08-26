import { useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function TestEvidenceForm({ task, onClose }) {
  const { currentUser, currentUserId } = useAuth();
  const { loadAllTasks } = useData();
  const { toast } = useToast();

  const [runUrl, setRunUrl] = useState('');
  const [passedCount, setPassedCount] = useState('');
  const [failedCount, setFailedCount] = useState('');
  const [notes, setNotes] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!runUrl.trim()) {
      setFieldError('A CI/trace URL is required.');
      return;
    }
    setFieldError('');
    const passed = passedCount === '' ? 0 : Number(passedCount);
    const failed = failedCount === '' ? 0 : Number(failedCount);
    if (!Number.isFinite(passed) || passed < 0 || !Number.isFinite(failed) || failed < 0) {
      setStatus('Pass/fail counts must be zero or a positive number.');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await sb.from('test_evidence').insert({
        task_id: task.key,
        submitted_by: currentUser,
        submitted_by_id: currentUserId,
        run_url: runUrl,
        passed_count: passed,
        failed_count: failed,
        notes: notes || null
      });
      if (error) throw error;
      await loadAllTasks();
      toast({ description: `Test evidence attached to ${task.ticketId}.` });
      onClose();
    } catch (e) {
      setStatus('Could not attach test run: ' + e.message);
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Attach test run</DialogTitle>
          <DialogDescription>{task.ticketId} — {task.title}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>CI / trace URL</Label>
            <Input type="text" value={runUrl} onChange={(e) => setRunUrl(e.target.value)} placeholder="https://github.com/.../actions/runs/..." />
            {fieldError && <div className="text-xs text-destructive mt-1">{fieldError}</div>}
          </div>
          <div className="meta-row">
            <div className="meta-field">
              <Label>Passed</Label>
              <Input type="number" value={passedCount} onChange={(e) => setPassedCount(e.target.value)} placeholder="0" />
            </div>
            <div className="meta-field">
              <Label>Failed</Label>
              <Input type="number" value={failedCount} onChange={(e) => setFailedCount(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        {status && <div className="text-sm text-destructive">{status}</div>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>Attach</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
