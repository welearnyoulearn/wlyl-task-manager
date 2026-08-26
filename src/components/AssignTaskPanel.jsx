import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useProfiles } from '../context/ProfilesContext.jsx';
import { sb } from '../lib/supabase.js';
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

  useEffect(() => {
    if (active) loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const people = useMemo(() => [...new Set(profiles.map(p => p.username))].sort(), [profiles]);

  const openConfirm = () => {
    const errors = {};
    if (!assignee) errors.assignee = 'Choose a person.';
    if (!title.trim()) errors.title = 'Enter a task title.';
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
      const { data, error } = await sb.from('tasks').insert({
        title: title.trim(), description,
        due_date: dueDate || null,
        priority,
        assignee,
        assigned_by: currentUser,
        status: 'Assigned',
        assigned_at: new Date().toISOString()
      }).select('ticket_id').single();
      if (error) throw error;
      setStatus(`Task ${data.ticket_id} assigned to ${assignee}.`);
      toast({ description: `${data.ticket_id} assigned to ${assignee}.` });
      setTitle('');
      setDescription('');
      setDueDate('');
      setConfirmOpen(false);
      setTimeout(() => setStatus(''), 2500);
    } catch (e) {
      setStatus('Error assigning task: ' + e.message);
      toast({ variant: 'destructive', description: 'Error assigning task: ' + e.message });
    } finally {
      setSubmitting(false);
    }
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
            <Label>Due date (optional)</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
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
            {dueDate && <div>Due {dueDate}</div>}
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
