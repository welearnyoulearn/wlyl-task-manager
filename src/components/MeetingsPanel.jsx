import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { sb } from '../lib/supabase.js';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { NativeSelect } from '@/components/ui/native-select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const EMPTY_DRAFT = { title: '', linkUrl: '', kind: 'recurring', weekday: '1', specificDate: '', timeOfDay: '17:00', active: true };

function todayLocalIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Next date (>= today) that falls on the given weekday, formatted the
// same way for display - used to give a recurring schedule a concrete
// "next occurrence" date instead of just "every Tuesday".
function nextDateForWeekday(weekday) {
  const d = new Date();
  const diff = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(timeOfDay) {
  const [h, m] = timeOfDay.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period} IST`;
}

function formatDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// Team-wide meeting schedule, maintained by admins: recurring (e.g.
// "every Tuesday") or one-off entries, each backed by the
// meeting-reminders Edge Function + cron (supabase/021_meeting_reminders_cron.sql)
// which emails everyone the join link the morning of and ~15 minutes
// before. Visible to every signed-in member; only admins can
// add/edit/delete (supabase/020_meetings.sql RLS).
export default function MeetingsPanel({ active }) {
  const { currentUser, currentUserId, isAdmin } = useAuth();
  const { meetings, loadMeetings } = useData();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (active) loadMeetings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const today = todayLocalIso();

  // One-off meetings that have already happened just stop being shown -
  // no cleanup job needed, and admins can still see/delete them via a
  // direct DB look if ever needed, but there's no ongoing UI value in
  // surfacing a meeting that's already over.
  const visibleMeetings = useMemo(
    () => meetings.filter(m => m.kind === 'recurring' || m.specificDate >= today),
    [meetings, today]
  );

  const openAddForm = () => {
    setEditingKey(null);
    setDraft(EMPTY_DRAFT);
    setFieldErrors({});
    setShowForm(true);
  };

  const openEditForm = (m) => {
    setEditingKey(m.key);
    setDraft({
      title: m.title,
      linkUrl: m.linkUrl,
      kind: m.kind,
      weekday: m.weekday != null ? String(m.weekday) : '1',
      specificDate: m.specificDate || '',
      timeOfDay: m.timeOfDay ? m.timeOfDay.slice(0, 5) : '17:00',
      active: m.active
    });
    setFieldErrors({});
    setShowForm(true);
  };

  const submit = async () => {
    const errors = {};
    if (!draft.title.trim()) errors.title = 'A title is required.';
    if (!draft.linkUrl.trim()) errors.linkUrl = 'A meeting link is required.';
    if (draft.kind === 'one_off' && !draft.specificDate) errors.specificDate = 'Pick a date.';
    if (!draft.timeOfDay) errors.timeOfDay = 'Pick a time.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const payload = {
        title: draft.title.trim(),
        link_url: draft.linkUrl.trim(),
        kind: draft.kind,
        weekday: draft.kind === 'recurring' ? Number(draft.weekday) : null,
        specific_date: draft.kind === 'one_off' ? draft.specificDate : null,
        time_of_day: draft.timeOfDay,
        active: draft.active
      };

      if (editingKey) {
        const { error } = await sb.from('meeting_schedules').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingKey);
        if (error) throw error;
        toast({ description: `"${payload.title}" updated.` });
      } else {
        const { error } = await sb.from('meeting_schedules').insert({
          ...payload,
          created_by: currentUser,
          created_by_id: currentUserId
        });
        if (error) throw error;
        toast({ description: `"${payload.title}" scheduled.` });
      }

      setShowForm(false);
      await loadMeetings();
    } catch (e) {
      toast({ variant: 'destructive', description: 'Could not save meeting: ' + e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const deleteMeeting = async (m) => {
    try {
      const { error } = await sb.from('meeting_schedules').delete().eq('id', m.key);
      if (error) throw error;
      await loadMeetings();
      toast({ description: `"${m.title}" removed.` });
    } catch (e) {
      toast({ variant: 'destructive', description: 'Could not delete meeting: ' + e.message });
    }
  };

  const toggleActive = async (m) => {
    try {
      const { error } = await sb.from('meeting_schedules').update({ active: !m.active, updated_at: new Date().toISOString() }).eq('id', m.key);
      if (error) throw error;
      await loadMeetings();
    } catch (e) {
      toast({ variant: 'destructive', description: 'Could not update meeting: ' + e.message });
    }
  };

  return (
    <div className={`panel ${active ? 'active' : ''}`} id="panel-meetings">
      <div className="sheet" style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
          <div>
            <div className="section-title" style={{ marginBottom: 4 }}>Meetings</div>
            <div className="section-hint">Recurring or one-off team meetings. Everyone gets an email the morning of, and again ~15 minutes before.</div>
          </div>
          {isAdmin && <Button size="sm" onClick={openAddForm}>Schedule Meeting</Button>}
        </div>

        <div style={{ marginTop: 16 }}>
          {visibleMeetings.length === 0 && (
            <div className="section-hint">No upcoming meetings.{isAdmin ? ' Click "Schedule Meeting" to add one.' : ''}</div>
          )}
          {visibleMeetings.map(m => (
            <Card key={m.key} className="entry-card mb-3">
              <CardContent className="p-4">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <span className="entry-name">
                    {m.title}
                    {!m.active && <Badge variant="secondary" className="ml-2 align-middle">Paused</Badge>}
                  </span>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {m.kind === 'recurring' && (
                        <Button variant="ghost" size="sm" onClick={() => toggleActive(m)}>{m.active ? 'Pause' : 'Resume'}</Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openEditForm(m)}>Edit</Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">Delete</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this meeting?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This permanently deletes "{m.title}". This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMeeting(m)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 13, marginTop: 6 }}>
                  {m.kind === 'recurring' ? (
                    <span>Every {WEEKDAYS[m.weekday]} at {formatTime(m.timeOfDay)} · next {formatDate(nextDateForWeekday(m.weekday))}</span>
                  ) : (
                    <span>{formatDate(m.specificDate)} at {formatTime(m.timeOfDay)}</span>
                  )}
                </div>
                <div style={{ marginTop: 6 }}>
                  <a href={m.linkUrl} target="_blank" rel="noreferrer">🔗 Join link</a>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
                  Scheduled by {m.createdBy}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={showForm} onOpenChange={(open) => { if (!open) setShowForm(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingKey ? 'Edit meeting' : 'Schedule a meeting'}</DialogTitle>
            <DialogDescription>Everyone with an email on file gets a reminder the morning of, and ~15 minutes before.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Title</Label>
              <Input
                type="text"
                placeholder="e.g. Weekly team sync"
                value={draft.title}
                onChange={(e) => setDraft(d => ({ ...d, title: e.target.value }))}
              />
              {fieldErrors.title && <div className="text-xs text-destructive mt-1">{fieldErrors.title}</div>}
            </div>
            <div>
              <Label>Meeting link</Label>
              <Input
                type="text"
                placeholder="https://meet.google.com/... or Zoom link"
                value={draft.linkUrl}
                onChange={(e) => setDraft(d => ({ ...d, linkUrl: e.target.value }))}
              />
              {fieldErrors.linkUrl && <div className="text-xs text-destructive mt-1">{fieldErrors.linkUrl}</div>}
            </div>
            <div className="meta-row">
              <div className="meta-field">
                <Label>Repeats</Label>
                <NativeSelect value={draft.kind} onChange={(e) => setDraft(d => ({ ...d, kind: e.target.value }))}>
                  <option value="recurring">Weekly, on a day</option>
                  <option value="one_off">One time</option>
                </NativeSelect>
              </div>
              {draft.kind === 'recurring' ? (
                <div className="meta-field">
                  <Label>Day of week</Label>
                  <NativeSelect value={draft.weekday} onChange={(e) => setDraft(d => ({ ...d, weekday: e.target.value }))}>
                    {WEEKDAYS.map((w, i) => <option key={i} value={i}>{w}</option>)}
                  </NativeSelect>
                </div>
              ) : (
                <div className="meta-field">
                  <Label>Date</Label>
                  <Input type="date" value={draft.specificDate} onChange={(e) => setDraft(d => ({ ...d, specificDate: e.target.value }))} />
                  {fieldErrors.specificDate && <div className="text-xs text-destructive mt-1">{fieldErrors.specificDate}</div>}
                </div>
              )}
              <div className="meta-field">
                <Label>Time (IST)</Label>
                <Input type="time" value={draft.timeOfDay} onChange={(e) => setDraft(d => ({ ...d, timeOfDay: e.target.value }))} />
                {fieldErrors.timeOfDay && <div className="text-xs text-destructive mt-1">{fieldErrors.timeOfDay}</div>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowForm(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}>{submitting ? 'Saving...' : editingKey ? 'Save changes' : 'Schedule Meeting'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
