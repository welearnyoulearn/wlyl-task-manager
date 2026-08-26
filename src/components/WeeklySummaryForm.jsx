import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { sb } from '../lib/supabase.js';
import { getISOWeek, formatWeekLabel } from '../lib/utils.js';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const CAT_FIELDS = ['catDev', 'catResearch', 'catTesting', 'catDocs'];

function todayDateInputValue() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Split out from Submit Update (Phase 5 follow-up): ticket activity notes
// now post individually and immediately from their own tab, so this form
// covers only the narrative/hours side of a weekly report - Hours,
// Learned, Blocked, Next week - saved to weekly_updates on its own
// schedule, independent of ticket notes.
export default function WeeklySummaryForm({ active }) {
  const { currentUser, currentUserId } = useAuth();
  const { loadAllEntries } = useData();
  const { toast } = useToast();

  const [weekOf, setWeekOf] = useState(todayDateInputValue());
  const [cats, setCats] = useState({ catDev: '', catResearch: '', catTesting: '', catDocs: '' });
  const [learned, setLearned] = useState('');
  const [blocked, setBlocked] = useState('');
  const [nextWeek, setNextWeek] = useState('');
  const [status, setStatus] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const weekLabel = weekOf ? formatWeekLabel(weekOf) : '';

  const openConfirm = () => {
    if (!currentUser) {
      setStatus('Please sign in above first.');
      return;
    }
    if (!weekOf) {
      setFieldError('Please choose a week date.');
      return;
    }
    for (const id of CAT_FIELDS) {
      const raw = cats[id];
      const num = raw === '' ? 0 : Number(raw);
      if (raw !== '' && (!Number.isFinite(num) || num < 0)) {
        setFieldError('Category values must be zero or a positive number.');
        return;
      }
    }
    setFieldError('');
    setStatus('');
    setConfirmOpen(true);
  };

  // Confirmation Dialog before the final write (Step 6, item 10) - this
  // upserts by (name, week_of), so resubmitting overwrites the previous
  // hours/narrative for that week; showing exactly what's about to be
  // saved lets a member catch a wrong week before it overwrites anything.
  // Ticket activity notes are entirely out of scope here now - they're
  // posted from Submit Update and untouched by this upsert.
  const submitSummary = async () => {
    setSubmitting(true);
    const catValues = {};
    for (const id of CAT_FIELDS) {
      const raw = cats[id];
      catValues[id] = raw === '' ? 0 : Number(raw);
    }
    const weekInfo = getISOWeek(weekOf);
    const entry = {
      name: currentUser.trim(), week_of: weekOf,
      user_id: currentUserId,
      week_number: weekInfo ? weekInfo.week : null,
      week_year: weekInfo ? weekInfo.year : null,
      cat_dev: catValues.catDev,
      cat_research: catValues.catResearch,
      cat_testing: catValues.catTesting,
      cat_docs: catValues.catDocs,
      learned,
      blocked,
      next_week: nextWeek,
      submitted_at: new Date().toISOString()
    };
    try {
      const { error } = await sb.from('weekly_updates').upsert(entry, { onConflict: 'name,week_of' });
      if (error) throw error;

      setStatus('Submitted. Saved to shared history.');
      setConfirmOpen(false);
      await loadAllEntries();
      toast({ description: 'Weekly summary submitted.' });
      setTimeout(() => setStatus(''), 2500);
    } catch (e) {
      setStatus('Save failed: ' + e.message);
      toast({ variant: 'destructive', description: 'Save failed: ' + e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const clearForm = () => {
    setCats({ catDev: '', catResearch: '', catTesting: '', catDocs: '' });
    setLearned('');
    setBlocked('');
    setNextWeek('');
    setStatus('Form cleared.');
    setTimeout(() => setStatus(''), 1500);
  };

  return (
    <div className={`panel ${active ? 'active' : ''}`} id="panel-summary">
      <div className="sheet">
        <div className="meta-row">
          <div className="meta-field">
            <Label>Name</Label>
            <Input type="text" value={currentUser} readOnly style={{ background: '#f4f4f4' }} />
          </div>
          <div className="meta-field">
            <Label>Week of</Label>
            <Input type="date" value={weekOf} onChange={(e) => setWeekOf(e.target.value)} />
            <div className="week-label">{weekLabel}</div>
          </div>
        </div>

        <section className="first">
          <div className="section-title">📊 Category breakdown</div>
          <div className="section-hint">Rough hours or ticket count per category.</div>
          {fieldError && <div className="text-xs text-destructive mt-1">{fieldError}</div>}
          <div className="category-grid">
            <div className="cat"><Label>Development</Label><Input type="number" placeholder="0" value={cats.catDev} onChange={(e) => setCats(c => ({ ...c, catDev: e.target.value }))} /></div>
            <div className="cat"><Label>Research</Label><Input type="number" placeholder="0" value={cats.catResearch} onChange={(e) => setCats(c => ({ ...c, catResearch: e.target.value }))} /></div>
            <div className="cat"><Label>Testing</Label><Input type="number" placeholder="0" value={cats.catTesting} onChange={(e) => setCats(c => ({ ...c, catTesting: e.target.value }))} /></div>
            <div className="cat"><Label>Documentation</Label><Input type="number" placeholder="0" value={cats.catDocs} onChange={(e) => setCats(c => ({ ...c, catDocs: e.target.value }))} /></div>
          </div>
        </section>

        <section>
          <div className="section-title">💡 Learned / discovered</div>
          <Textarea placeholder="- Found that the staging DB has stale seed data" value={learned} onChange={(e) => setLearned(e.target.value)} />
        </section>

        <section className="blocked-box">
          <div className="section-title">🚧 Blocked on</div>
          <div className="section-hint">Leave blank if nothing.</div>
          <Textarea placeholder="- Waiting on design review" value={blocked} onChange={(e) => setBlocked(e.target.value)} />
        </section>

        <section>
          <div className="section-title">➡️ Next week</div>
          <Textarea placeholder="- Start on payment gateway integration" value={nextWeek} onChange={(e) => setNextWeek(e.target.value)} />
        </section>

        <div className="actions">
          <Button onClick={openConfirm} disabled={submitting}>Submit Update</Button>
          <Button variant="ghost" onClick={clearForm} disabled={submitting}>Clear Form</Button>
        </div>
        <div className="status">{status}</div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Submit this week's summary?</DialogTitle>
            <DialogDescription>{currentUser} — {weekLabel} ({weekOf})</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 text-sm max-h-[50vh] overflow-y-auto">
            <div>
              <div className="font-medium mb-1">Hours</div>
              <div className="text-muted-foreground">
                Dev {cats.catDev || 0} · Research {cats.catResearch || 0} · Testing {cats.catTesting || 0} · Docs {cats.catDocs || 0}
              </div>
            </div>
            {learned && <div><div className="font-medium mb-1">Learned</div><div className="text-muted-foreground whitespace-pre-wrap">{learned}</div></div>}
            {blocked && <div><div className="font-medium mb-1">Blocked on</div><div className="text-muted-foreground whitespace-pre-wrap">{blocked}</div></div>}
            {nextWeek && <div><div className="font-medium mb-1">Next week</div><div className="text-muted-foreground whitespace-pre-wrap">{nextWeek}</div></div>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={submitSummary} disabled={submitting}>Confirm & Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
