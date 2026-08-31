import { useEffect, useMemo, useState } from 'react';
import { Calendar, RefreshCw, CalendarDays, Video, Pause, Play, Users2, Sparkles, Copy, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { useProfiles } from '../context/ProfilesContext.jsx';
import { sb } from '../lib/supabase.js';
import { createGoogleMeetLink } from '../lib/googleMeet.js';
import { sendMeetingScheduledEmail, sendMeetingRescheduledEmail, sendMeetingCancelledEmail } from '../lib/email.js';
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

const EMPTY_DRAFT = { title: '', linkUrl: '', kind: 'recurring', weekday: '1', specificDate: '', timeOfDay: '17:00', active: true, recipientMode: 'everyone', recipientIds: [], linkIsGenerated: false };

// Schedule label shown in emails/UI - shared by the "scheduled",
// "rescheduled", and card-display code paths so they never drift out
// of sync with each other.
function scheduleLabelFor({ kind, weekday, specificDate, timeOfDay }) {
  return kind === 'recurring'
    ? `Every ${WEEKDAYS[Number(weekday)]} at ${formatTime(timeOfDay)}, starting ${formatDate(nextDateForWeekday(Number(weekday)))}`
    : `${formatDate(specificDate)} at ${formatTime(timeOfDay)}`;
}

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
  const { profiles, loadProfiles } = useProfiles();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [generatingMeet, setGeneratingMeet] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);

  const copyMeetingLink = async (meeting) => {
    try {
      await navigator.clipboard.writeText(meeting.linkUrl);
      setCopiedKey(meeting.key);
      setTimeout(() => setCopiedKey(prev => (prev === meeting.key ? null : prev)), 1500);
    } catch (e) {
      toast({ variant: 'destructive', description: 'Could not copy link - copy it manually instead.' });
    }
  };

  useEffect(() => {
    if (active) {
      loadMeetings();
      loadProfiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const today = todayLocalIso();
  const profileById = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);
  const recipientOptions = useMemo(() => profiles.filter(p => p.email), [profiles]);
  // A Google-generated link is locked once the meeting has actually
  // been saved (editingKey set) - it's already been emailed out, so
  // editing or regenerating it would silently break the link people
  // received. A brand-new, not-yet-saved draft can still regenerate
  // freely since nothing's gone out yet.
  const linkLocked = !!editingKey && draft.linkIsGenerated;

  // Cancelled meetings never show (that's the whole point of
  // cancelling one); one-off meetings that have already happened just
  // stop being shown too - no cleanup job needed, there's no ongoing
  // UI value in surfacing a meeting that's already over.
  const visibleMeetings = useMemo(
    () => meetings.filter(m => !m.cancelledAt && (m.kind === 'recurring' || m.specificDate >= today)),
    [meetings, today]
  );

  // Re-fetches profiles right when the form opens (not just whenever
  // the Meetings tab last activated) so a member/admin added minutes
  // ago - or even by someone else, in another session - definitely
  // shows up in the Custom-selection recipient picker, instead of
  // relying on whatever was already in memory.
  const openAddForm = () => {
    setEditingKey(null);
    setDraft(EMPTY_DRAFT);
    setFieldErrors({});
    setShowForm(true);
    loadProfiles();
  };

  const openEditForm = (m) => {
    loadProfiles();
    setEditingKey(m.key);
    setDraft({
      title: m.title,
      linkUrl: m.linkUrl,
      kind: m.kind,
      weekday: m.weekday != null ? String(m.weekday) : '1',
      specificDate: m.specificDate || '',
      timeOfDay: m.timeOfDay ? m.timeOfDay.slice(0, 5) : '17:00',
      active: m.active,
      recipientMode: m.recipientMode || 'everyone',
      recipientIds: m.recipientIds || [],
      linkIsGenerated: m.linkIsGenerated || false
    });
    setFieldErrors({});
    setShowForm(true);
  };

  // A one-off throwaway calendar event just to mint a Meet link - no
  // attendees, no Google-sent notifications (see create-google-meet).
  // The event's own date/duration don't need to match the real
  // meeting's cadence exactly (a recurring weekly meeting reuses this
  // same link every week regardless), so a nominal 1-hour slot on the
  // next matching date/the chosen date is enough to generate it.
  const generateGoogleMeetLink = async () => {
    if (!draft.title.trim()) {
      setFieldErrors(prev => ({ ...prev, title: 'Enter a title before generating a Meet link.' }));
      return;
    }
    if (draft.kind === 'one_off' && !draft.specificDate) {
      setFieldErrors(prev => ({ ...prev, specificDate: 'Pick a date before generating a Meet link.' }));
      return;
    }
    setGeneratingMeet(true);
    try {
      const dateStr = draft.kind === 'recurring' ? nextDateForWeekday(Number(draft.weekday)) : draft.specificDate;
      const [h, m] = draft.timeOfDay.split(':').map(Number);
      const startDateTime = `${dateStr}T${draft.timeOfDay}:00+05:30`;
      const endH = String((h + 1) % 24).padStart(2, '0');
      const endDateTime = `${dateStr}T${endH}:${String(m).padStart(2, '0')}:00+05:30`;
      const { meetLink } = await createGoogleMeetLink({ title: draft.title.trim(), startDateTime, endDateTime });
      setDraft(d => ({ ...d, linkUrl: meetLink, linkIsGenerated: true }));
      toast({ description: 'Google Meet link generated.' });
    } catch (e) {
      toast({ variant: 'destructive', description: 'Could not generate Meet link: ' + e.message });
    } finally {
      setGeneratingMeet(false);
    }
  };

  const submit = async () => {
    const errors = {};
    if (!draft.title.trim()) errors.title = 'A title is required.';
    if (!draft.linkUrl.trim()) errors.linkUrl = 'A meeting link is required.';
    if (draft.kind === 'one_off' && !draft.specificDate) errors.specificDate = 'Pick a date.';
    if (!draft.timeOfDay) errors.timeOfDay = 'Pick a time.';
    if (draft.recipientMode === 'custom' && draft.recipientIds.length === 0) errors.recipients = 'Pick at least one person, or switch to Everyone.';
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
        active: draft.active,
        recipient_mode: draft.recipientMode,
        recipient_ids: draft.recipientMode === 'custom' ? draft.recipientIds : null,
        link_is_generated: draft.linkIsGenerated
      };

      const recipients = draft.recipientMode === 'custom'
        ? recipientOptions.filter(p => draft.recipientIds.includes(p.id))
        : recipientOptions;
      const newScheduleLabel = scheduleLabelFor(draft);

      if (editingKey) {
        const original = meetings.find(x => x.key === editingKey);
        const { error } = await sb.from('meeting_schedules').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingKey);
        if (error) throw error;
        toast({ description: `"${payload.title}" updated.` });

        // Only the actual date/time/recurrence moving counts as a
        // reschedule worth emailing about - editing the title,
        // recipients, or link on its own doesn't warrant re-notifying
        // everyone.
        const scheduleChanged = original && (
          original.kind !== draft.kind
          || String(original.weekday) !== String(draft.kind === 'recurring' ? Number(draft.weekday) : null)
          || (original.specificDate || '') !== (draft.kind === 'one_off' ? draft.specificDate : '')
          || (original.timeOfDay || '').slice(0, 5) !== draft.timeOfDay
        );
        if (scheduleChanged) {
          const oldScheduleLabel = scheduleLabelFor({
            kind: original.kind, weekday: original.weekday,
            specificDate: original.specificDate, timeOfDay: (original.timeOfDay || '').slice(0, 5)
          });
          recipients.forEach(p => {
            sendMeetingRescheduledEmail({
              to: p.email,
              recipientName: p.username,
              title: payload.title,
              oldScheduleLabel,
              newScheduleLabel,
              linkUrl: payload.link_url,
              updatedBy: currentUser
            });
          });
        }
      } else {
        const { error } = await sb.from('meeting_schedules').insert({
          ...payload,
          created_by: currentUser,
          created_by_id: currentUserId
        });
        if (error) throw error;
        toast({ description: `"${payload.title}" scheduled.` });

        // "Scheduled" notification, on top of (not instead of) the
        // morning-of / 15-min-before reminders from the cron - fired
        // once here, client-side, only when a NEW meeting is created
        // (not on edits), so people find out right away and can plan
        // around it instead of only the morning it happens.
        recipients.forEach(p => {
          sendMeetingScheduledEmail({
            to: p.email,
            recipientName: p.username,
            title: payload.title,
            scheduleLabel: newScheduleLabel,
            linkUrl: payload.link_url,
            scheduledBy: currentUser
          });
        });
      }

      setShowForm(false);
      await loadMeetings();
    } catch (e) {
      toast({ variant: 'destructive', description: 'Could not save meeting: ' + e.message });
    } finally {
      setSubmitting(false);
    }
  };

  // Soft-cancel, not a hard delete - the row stays for the audit trail
  // and stops matching the meeting-reminders cron (cancelled_at is not
  // null), but the main reason for this over a delete is that
  // cancelling is the one moment recipients need to be told the
  // meeting isn't happening anymore.
  const cancelMeeting = async (m) => {
    try {
      const { error } = await sb.from('meeting_schedules').update({
        cancelled_at: new Date().toISOString(),
        active: false
      }).eq('id', m.key);
      if (error) throw error;
      await loadMeetings();
      toast({ description: `"${m.title}" cancelled.` });

      const recipients = m.recipientMode === 'custom'
        ? recipientOptions.filter(p => m.recipientIds.includes(p.id))
        : recipientOptions;
      const scheduleLabel = scheduleLabelFor({
        kind: m.kind, weekday: m.weekday, specificDate: m.specificDate, timeOfDay: (m.timeOfDay || '').slice(0, 5)
      });
      recipients.forEach(p => {
        sendMeetingCancelledEmail({
          to: p.email,
          recipientName: p.username,
          title: m.title,
          scheduleLabel,
          cancelledBy: currentUser
        });
      });
    } catch (e) {
      toast({ variant: 'destructive', description: 'Could not cancel meeting: ' + e.message });
    }
  };

  const toggleRecipient = (id) => {
    setDraft(d => ({
      ...d,
      recipientIds: d.recipientIds.includes(id) ? d.recipientIds.filter(x => x !== id) : [...d.recipientIds, id]
    }));
  };

  const invitedLabel = (m) => {
    if (m.recipientMode !== 'custom') return 'Everyone';
    const names = m.recipientIds.map(id => profileById.get(id)?.username).filter(Boolean);
    return names.length > 0 ? names.join(', ') : 'No one selected';
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
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div className="card-icon-badge" style={{ width: 44, height: 44, borderRadius: 12 }}>
              <Calendar size={20} strokeWidth={2.2} />
            </div>
            <div>
              <div className="section-title" style={{ marginBottom: 4 }}>Meetings</div>
              <div className="section-hint">Recurring or one-off team meetings. Everyone gets an email the morning of, and again ~15 minutes before.</div>
            </div>
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
                <div className="card-title-row">
                  <div className={`card-icon-badge${m.kind === 'one_off' ? ' amber' : ''}`}>
                    {m.kind === 'recurring' ? <RefreshCw size={17} strokeWidth={2.2} /> : <CalendarDays size={17} strokeWidth={2.2} />}
                  </div>
                  <div className="card-title-main">
                    <div className="card-title-text">
                      {m.title}
                      {!m.active && <Badge variant="secondary" className="ml-2 align-middle">Paused</Badge>}
                    </div>
                    <div style={{ fontSize: 13.5, marginTop: 6, color: 'var(--ink)' }}>
                      {m.kind === 'recurring' ? (
                        <span>Every {WEEKDAYS[m.weekday]} at {formatTime(m.timeOfDay)} · next {formatDate(nextDateForWeekday(m.weekday))}</span>
                      ) : (
                        <span>{formatDate(m.specificDate)} at {formatTime(m.timeOfDay)}</span>
                      )}
                    </div>
                    <div className="card-chip-row">
                      <a href={m.linkUrl} target="_blank" rel="noreferrer" className="chip">
                        <Video size={13} strokeWidth={2.3} /> Join link
                      </a>
                      <button
                        type="button"
                        className="chip chip-muted"
                        style={{ border: 'none', font: 'inherit' }}
                        onClick={() => copyMeetingLink(m)}
                        title="Copy meeting link"
                      >
                        {copiedKey === m.key ? (
                          <><Check size={13} strokeWidth={2.3} /> Copied</>
                        ) : (
                          <><Copy size={13} strokeWidth={2.3} /> Copy link</>
                        )}
                      </button>
                      <span className="chip chip-muted">
                        <Users2 size={13} strokeWidth={2.3} /> {invitedLabel(m)}
                      </span>
                    </div>
                    <div className="card-meta-line">
                      Scheduled by {m.createdBy}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="card-actions">
                      {m.kind === 'recurring' && (
                        <Button variant="ghost" size="sm" title={m.active ? 'Pause' : 'Resume'} onClick={() => toggleActive(m)}>
                          {m.active ? <Pause size={14} strokeWidth={2.3} /> : <Play size={14} strokeWidth={2.3} />}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openEditForm(m)}>Edit</Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">Cancel Meeting</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Cancel this meeting?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This cancels "{m.title}" and emails everyone who was invited to let them know.
                              No further reminders will go out for it. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Never mind</AlertDialogCancel>
                            <AlertDialogAction onClick={() => cancelMeeting(m)}>Cancel Meeting</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
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
              <div style={{ display: 'flex', gap: 8 }}>
                <Input
                  type="text"
                  placeholder="https://meet.google.com/... or Zoom link"
                  value={draft.linkUrl}
                  disabled={linkLocked}
                  onChange={(e) => setDraft(d => ({ ...d, linkUrl: e.target.value }))}
                />
                {!linkLocked && (
                  <Button type="button" variant="secondary" onClick={generateGoogleMeetLink} disabled={generatingMeet} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                    <Sparkles size={14} strokeWidth={2.3} className="mr-1.5" />
                    {generatingMeet ? 'Generating...' : 'Generate Meet link'}
                  </Button>
                )}
              </div>
              {linkLocked && (
                <div className="section-hint" style={{ marginTop: 4 }}>
                  This link was auto-generated and already sent out - it's locked to avoid breaking what people received.
                  Cancel this meeting and schedule a new one if you need a different link.
                </div>
              )}
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
            <div>
              <Label>Send reminders to</Label>
              <NativeSelect
                value={draft.recipientMode}
                onChange={(e) => setDraft(d => ({ ...d, recipientMode: e.target.value }))}
              >
                <option value="everyone">Everyone</option>
                <option value="custom">Custom selection</option>
              </NativeSelect>
              {draft.recipientMode === 'custom' && (
                <div style={{ marginTop: 8, maxHeight: 180, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 6, padding: 8 }}>
                  {recipientOptions.length === 0 && (
                    <div className="section-hint">No members with an email on file yet.</div>
                  )}
                  {recipientOptions.map(p => (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0' }}>
                      <input
                        type="checkbox"
                        checked={draft.recipientIds.includes(p.id)}
                        onChange={() => toggleRecipient(p.id)}
                      />
                      {p.username}
                    </label>
                  ))}
                </div>
              )}
              {fieldErrors.recipients && <div className="text-xs text-destructive mt-1">{fieldErrors.recipients}</div>}
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
