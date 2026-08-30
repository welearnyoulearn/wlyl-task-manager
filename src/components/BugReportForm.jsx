import { useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { useProfiles } from '../context/ProfilesContext.jsx';
import { uploadFile, UPLOAD_KINDS } from '../lib/upload.js';
import { sendQaFailedEmail } from '../lib/email.js';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const SEVERITIES = ['Blocker', 'Major', 'Minor', 'Cosmetic'];
const MAX_SCREENSHOTS = 5;

// Opened only from "Fail QA" now - the standalone "Report Bug" action
// was removed from the app (only Report Bug / Attach Test Run stood
// alone; Fail QA's bug-report step stays, since it's core to the QA
// workflow, not the standalone "log a bug anytime" feature).
export default function BugReportForm({ task, onClose }) {
  const { currentUser, currentUserId } = useAuth();
  const { loadAllTasks } = useData();
  const { profiles } = useProfiles();
  const { toast } = useToast();

  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [expectedBehavior, setExpectedBehavior] = useState('');
  const [actualBehavior, setActualBehavior] = useState('');
  const [severity, setSeverity] = useState('Major');
  const [environment, setEnvironment] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [screenshots, setScreenshots] = useState([]);
  const [uploadingScreenshots, setUploadingScreenshots] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const screenshotInputRef = useRef(null);

  // Caps at 5 screenshots so a tester can't accidentally attach an
  // entire camera roll - each is compressed client-side before upload
  // (see src/lib/upload.js) to keep R2 storage/egress down.
  const onPickScreenshots = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setScreenshots(prev => {
      const combined = [...prev, ...files].slice(0, MAX_SCREENSHOTS);
      return combined;
    });
  };

  const removeScreenshot = (index) => {
    setScreenshots(prev => prev.filter((_, i) => i !== index));
  };

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
      let evidenceUrls = [];
      if (screenshots.length > 0) {
        setUploadingScreenshots(true);
        evidenceUrls = await Promise.all(screenshots.map(f => uploadFile(UPLOAD_KINDS.QA_EVIDENCE, f).then(r => r.url)));
        setUploadingScreenshots(false);
      }
      const { error: insertErr } = await sb.from('bug_reports').insert({
        task_id: task.key,
        reported_by: currentUser,
        reported_by_id: currentUserId,
        steps_to_reproduce: stepsToReproduce,
        expected_behavior: expectedBehavior,
        actual_behavior: actualBehavior,
        severity,
        environment: environment || null,
        evidence_url: evidenceUrl || null,
        evidence_urls: evidenceUrls
      });
      if (insertErr) throw insertErr;

      const { error: updateErr } = await sb.from('tasks').update({ qa_status: 'Failed' }).eq('id', task.key);
      if (updateErr) throw updateErr;

      await loadAllTasks();
      toast({ description: `${task.ticketId} failed QA — bug report logged.` });

      // Notify whoever needs to act next: the ticket's developer
      // (assignee) so they can rework it and mark it Ready for QA
      // again, and every admin. Skip a recipient who's also the
      // reporter (a tester failing their own directly-assigned ticket
      // shouldn't get a "your ticket failed" email about themselves),
      // and skip anyone with no email on file - sendEmail already
      // no-ops on that, this just avoids the lookup noise.
      const recipients = new Map();
      const assigneeProfile = profiles.find(p => p.username === task.assignee);
      if (assigneeProfile?.email && assigneeProfile.username !== currentUser) {
        recipients.set(assigneeProfile.email, assigneeProfile.username);
      }
      profiles.filter(p => p.is_admin && p.email && p.username !== currentUser).forEach(p => {
        recipients.set(p.email, p.username);
      });
      recipients.forEach((recipientName, email) => {
        sendQaFailedEmail({
          to: email,
          recipientName,
          ticketId: task.ticketId,
          title: task.title,
          reporterName: currentUser,
          severity,
          stepsToReproduce,
          expectedBehavior,
          actualBehavior
        });
      });

      onClose();
    } catch (e) {
      setStatus('Could not submit bug report: ' + e.message);
      setSubmitting(false);
      setUploadingScreenshots(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Fail QA — bug report</DialogTitle>
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
          <div>
            <Label>Screenshots (optional, up to {MAX_SCREENSHOTS})</Label>
            {screenshots.length < MAX_SCREENSHOTS && (
              <input ref={screenshotInputRef} type="file" accept="image/*" multiple onChange={onPickScreenshots} />
            )}
            {screenshots.length > 0 && (
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
                {screenshots.map((f, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{f.name}</span>
                    <Button variant="ghost" size="sm" className="h-auto p-0 text-xs" onClick={() => removeScreenshot(i)}>Remove</Button>
                  </li>
                ))}
              </ul>
            )}
            {uploadingScreenshots && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Uploading screenshots...</div>}
          </div>
        </div>
        {status && <div className="text-sm text-destructive">{status}</div>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>Submit and Fail QA</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
