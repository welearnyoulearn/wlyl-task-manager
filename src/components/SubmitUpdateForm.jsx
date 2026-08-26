import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { useTicketDetail } from '../context/TicketDetailContext.jsx';
import { sb } from '../lib/supabase.js';
import { formatWeekLabel, getWeekRange } from '../lib/utils.js';
import { computeWeeklyActivity, summarizeActivity } from '../lib/weeklyActivity.js';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function todayDateInputValue() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Ensures a weekly_updates row exists for (name, week) before writing a
// weekly_update_items row against it - weekly_update_items.weekly_update_id
// is a not-null FK, so a ticket note can't be posted before some report
// row for that week exists. Posting a note is the first save action a
// member might take in a given week (they may not have visited the
// separate Weekly Summary tab yet), so this creates a bare placeholder
// row (empty narrative fields, zero hours) on demand rather than forcing
// the member to submit the summary form first just to unlock note-posting.
async function ensureWeeklyUpdateRow(name, weekOf, userId) {
  const { data: existing, error: selErr } = await sb
    .from('weekly_updates')
    .select('id')
    .eq('name', name)
    .eq('week_of', weekOf)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing.id;

  const { data: created, error: insErr } = await sb
    .from('weekly_updates')
    .insert({ name, week_of: weekOf, user_id: userId, cat_dev: 0, cat_research: 0, cat_testing: 0, cat_docs: 0 })
    .select('id')
    .single();
  if (insErr) throw insErr;
  return created.id;
}

export default function SubmitUpdateForm({ active }) {
  const { currentUser, currentUserId } = useAuth();
  const { allTasks, loadAllTasks, loadAllEntries } = useData();
  const { openTicketDetail } = useTicketDetail();
  const { toast } = useToast();

  const [weekOf, setWeekOf] = useState(todayDateInputValue());
  const [notes, setNotes] = useState({}); // ticketId -> note text
  const [posting, setPosting] = useState({}); // ticketId -> bool
  const [posted, setPosted] = useState({}); // ticketId -> bool (this session, for a quick visual confirmation beyond the toast)

  useEffect(() => {
    if (active) loadAllTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const weekRange = useMemo(() => getWeekRange(weekOf), [weekOf]);

  const activity = useMemo(() => {
    if (!weekRange) return [];
    return computeWeeklyActivity(allTasks, currentUser, currentUserId, weekRange.start, weekRange.end);
  }, [allTasks, currentUser, currentUserId, weekRange]);

  const weekLabel = weekOf ? formatWeekLabel(weekOf) : '';

  // Each ticket posts independently the moment its own Post button is
  // clicked - no shared confirm dialog and no dependency on the other
  // narrative fields, which now live on their own Weekly Summary tab.
  // weekly_update_items has a unique (weekly_update_id, ticket_id)
  // constraint (011_weekly_activity_items.sql), so upsert here is a
  // real per-row update, not a delete-and-reinsert of the whole set.
  const postNote = async (ticketId) => {
    setPosting(p => ({ ...p, [ticketId]: true }));
    try {
      const weeklyUpdateId = await ensureWeeklyUpdateRow(currentUser.trim(), weekOf, currentUserId);
      const { error } = await sb.from('weekly_update_items')
        .upsert({ weekly_update_id: weeklyUpdateId, ticket_id: ticketId, note: notes[ticketId] || '' }, { onConflict: 'weekly_update_id,ticket_id' });
      if (error) throw error;
      await loadAllEntries();
      setPosted(p => ({ ...p, [ticketId]: true }));
      toast({ description: `${ticketId} note posted.` });
    } catch (e) {
      toast({ variant: 'destructive', description: `Could not post note for ${ticketId}: ` + e.message });
    } finally {
      setPosting(p => ({ ...p, [ticketId]: false }));
    }
  };

  return (
    <div className={`panel ${active ? 'active' : ''}`} id="panel-submit">
      <div className="sheet">
        <div className="meta-row">
          <div className="meta-field">
            <Label>Name</Label>
            <Input type="text" value={currentUser} readOnly style={{ background: '#f4f4f4' }} />
          </div>
          <div className="meta-field">
            <Label>Week of</Label>
            <Input type="date" value={weekOf} onChange={(e) => { setWeekOf(e.target.value); setPosted({}); }} />
            <div className="week-label">{weekLabel}</div>
          </div>
        </div>

        <section className="first">
          <div className="section-title">🎯 Your ticket activity this week</div>
          <div className="section-hint">
            Auto-detected from tickets you're assigned to (dev or QA) that changed status, QA status, or got a comment/bug report between {weekRange?.start} and {weekRange?.end}. Add an optional note per ticket and post it — each ticket saves on its own.
          </div>
          {activity.length === 0 ? (
            <div className="empty" style={{ marginTop: 8 }}>No ticket activity detected this week.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              {activity.map(a => (
                <div key={a.ticketKey} className="entry-block">
                  <div className="label">
                    <span className="ticket-link" style={{ fontSize: 12 }} onClick={() => openTicketDetail(a.ticketId)}>{a.ticketId}</span> {a.title}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{summarizeActivity(a)}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Input
                      type="text"
                      placeholder="Add a note (optional)"
                      value={notes[a.ticketId] || ''}
                      onChange={(e) => { setNotes(n => ({ ...n, [a.ticketId]: e.target.value })); setPosted(p => ({ ...p, [a.ticketId]: false })); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') postNote(a.ticketId); }}
                      style={{ flex: 1 }}
                    />
                    <Button
                      variant="secondary"
                      onClick={() => postNote(a.ticketId)}
                      disabled={posting[a.ticketId]}
                    >
                      {posted[a.ticketId] ? 'Posted ✓' : 'Post'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
