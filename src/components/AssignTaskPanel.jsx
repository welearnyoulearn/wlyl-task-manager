import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useProfiles } from '../context/ProfilesContext.jsx';
import { sb } from '../lib/supabase.js';
import { uploadFile, UPLOAD_KINDS } from '../lib/upload.js';
import { sendTaskAssignedEmail } from '../lib/email.js';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function AssignTaskPanel({ active }) {
  const { currentUser, loadProfiles } = useAuth();
  const { profiles } = useProfiles();
  const { toast } = useToast();

  const [assignee, setAssignee] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [status, setStatus] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [descriptionFile, setDescriptionFile] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (active) loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const people = useMemo(() => [...new Set(profiles.map(p => p.username))].sort(), [profiles]);

  const openConfirm = () => {
    const errors = {};
    if (!assignee) errors.assignee = 'Choose a person.';
    if (!title.trim()) errors.title = 'Enter a task title.';
    if (!dueDate) errors.dueDate = 'Due date is required.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setStatus('Please fix the highlighted fields.');
      return;
    }
    setStatus('');
    setConfirmOpen(true);
  };

  // Confirmation Dialog appears BEFORE the insert (Step 6, item 13) - the
  // action is genuinely irreversible-in-spirit (the assignee gets
  // notified/sees it immediately in My Tasks), so confirming before
  // creating avoids ever showing someone a wrongly-addressed ticket, even
  // briefly, rather than confirming after the fact.
  const assignTask = async () => {
    setSubmitting(true);
    try {
      let descriptionFileUrl = null;
      let descriptionFileName = null;
      if (descriptionFile) {
        const uploaded = await uploadFile(UPLOAD_KINDS.TASK_DESCRIPTION, descriptionFile);
        descriptionFileUrl = uploaded.url;
        descriptionFileName = uploaded.fileName;
      }
      const { data, error } = await sb.from('tasks').insert({
        title: title.trim(), description,
        description_file_url: descriptionFileUrl,
        description_file_name: descriptionFileName,
        due_date: dueDate,
        priority,
        assignee,
        assigned_by: currentUser,
        status: 'Assigned',
        assigned_at: new Date().toISOString()
      }).select('ticket_id').single();
      if (error) throw error;
      setStatus(`Task ${data.ticket_id} assigned to ${assignee}.`);
      toast({ description: `${data.ticket_id} assigned to ${assignee}.` });

      const assigneeProfile = profiles.find(p => p.username === assignee);
      if (assigneeProfile?.email) {
        sendTaskAssignedEmail({
          to: assigneeProfile.email,
          ticketId: data.ticket_id,
          title: title.trim(),
          description,
          dueDate,
          assigneeName: assignee
        });
      }
      setTitle('');
      setDescription('');
      setDueDate('');
      setDescriptionFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setConfirmOpen(false);
      setTimeout(() => setStatus(''), 2500);
    } catch (e) {
      setStatus('Error assigning task: ' + e.message);
      toast({ variant: 'destructive', description: 'Error assigning task: ' + e.message });
    } finally {
      setSubmitting(false);
    }
  };

  // One file is enough to convey a requirement (mockup, spec doc, etc.)
  // - not a multi-file uploader. Any file type is accepted (image or
  // document); only images get compressed before upload, see
  // src/lib/upload.js.
  const onPickDescriptionFile = (e) => {
    const file = e.target.files?.[0];
    setUploadError('');
    if (!file) { setDescriptionFile(null); return; }
    if (file.size > 15 * 1024 * 1024) {
      setUploadError('File is too large (max 15MB).');
      e.target.value = '';
      setDescriptionFile(null);
      return;
    }
    setDescriptionFile(file);
  };

  return (
    <div className={`panel ${active ? 'active' : ''}`} id="panel-assigntask">
      <div className="sheet">
        <div className="section-title" style={{ marginBottom: 4 }}>Assign a new task</div>
        <div className="section-hint">Give it a clear title so the assignee knows exactly what's expected.</div>
        <div className="meta-row">
          <div className="meta-field">
            <Label>Assign to</Label>
            <NativeSelect id="taskAssignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">— choose person —</option>
              {people.map(p => <option key={p} value={p}>{p}</option>)}
            </NativeSelect>
            {fieldErrors.assignee && <div className="text-xs text-destructive mt-1">{fieldErrors.assignee}</div>}
          </div>
          <div className="meta-field">
            <Label>Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            {fieldErrors.dueDate && <div className="text-xs text-destructive mt-1">{fieldErrors.dueDate}</div>}
          </div>
          <div className="meta-field">
            <Label>Priority</Label>
            <NativeSelect value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="Normal">Normal</option>
              <option value="High">High</option>
              <option value="Low">Low</option>
            </NativeSelect>
          </div>
        </div>
        <section className="first">
          <div className="section-title">Task title</div>
          <Input
            type="text"
            placeholder="e.g. Set up staging environment"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          {fieldErrors.title && <div className="text-xs text-destructive mt-1">{fieldErrors.title}</div>}
        </section>
        <section>
          <div className="section-title">Description</div>
          <Textarea placeholder="Details, links, acceptance criteria..." value={description} onChange={(e) => setDescription(e.target.value)} />
          <div style={{ marginTop: 10 }}>
            <Label>Attach a file (optional)</Label>
            <div className="section-hint" style={{ marginBottom: 6 }}>
              Convey the requirement with a mockup, spec, or reference file - visible to the assignee on the ticket.
            </div>
            <input ref={fileInputRef} type="file" onChange={onPickDescriptionFile} />
            {descriptionFile && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{descriptionFile.name}</div>}
            {uploadError && <div className="text-xs text-destructive mt-1">{uploadError}</div>}
          </div>
        </section>
        <div className="actions">
          <Button onClick={openConfirm}>Assign Task</Button>
        </div>
        <div className="status" id="assignTaskStatus">{status}</div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign this task to {assignee}?</DialogTitle>
            <DialogDescription>{title}</DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-1">
            <div>Due {dueDate}</div>
            <div>Priority: {priority}</div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={assignTask} disabled={submitting}>Confirm & Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
