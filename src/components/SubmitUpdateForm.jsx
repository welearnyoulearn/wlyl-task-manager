import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { sb } from '../lib/supabase.js';
import { getISOWeek, formatWeekLabel } from '../lib/utils.js';

const CAT_FIELDS = ['catDev', 'catResearch', 'catTesting', 'catDocs'];

function todayDateInputValue() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function SubmitUpdateForm({ active }) {
  const { currentUser, currentUserId } = useAuth();
  const { allTasks, loadAllTasks, loadAllEntries } = useData();

  const [weekOf, setWeekOf] = useState(todayDateInputValue());
  const [completed, setCompleted] = useState('');
  const [completedTicket, setCompletedTicket] = useState('');
  const [inProgress, setInProgress] = useState('');
  const [inProgressTicket, setInProgressTicket] = useState('');
  const [cats, setCats] = useState({ catDev: '', catResearch: '', catTesting: '', catDocs: '' });
  const [learned, setLearned] = useState('');
  const [blocked, setBlocked] = useState('');
  const [nextWeek, setNextWeek] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    loadAllTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myAcceptedTickets = useMemo(() => {
    if (!currentUser) return [];
    return allTasks
      .filter(t => t.assignee.toLowerCase() === currentUser.toLowerCase() && t.status !== 'Assigned')
      .sort((a, b) => (b.acceptedAt || '').localeCompare(a.acceptedAt || ''));
  }, [allTasks, currentUser]);

  const weekLabel = weekOf ? formatWeekLabel(weekOf) : '';

  const submitUpdate = async () => {
    if (!currentUser) {
      setStatus('Please sign in above first.');
      return;
    }
    const name = currentUser.trim();
    if (!name || !weekOf) {
      setStatus('Please enter your name and week date.');
      return;
    }
    if (!completed.trim() && !inProgress.trim()) {
      setStatus('Please fill in at least "Completed" or "In progress".');
      return;
    }
    const catValues = {};
    for (const id of CAT_FIELDS) {
      const raw = cats[id];
      const num = raw === '' ? 0 : Number(raw);
      if (raw !== '' && (!Number.isFinite(num) || num < 0)) {
        setStatus('Category values must be zero or a positive number.');
        return;
      }
      catValues[id] = num;
    }
    const weekInfo = getISOWeek(weekOf);
    const entry = {
      name, week_of: weekOf,
      user_id: currentUserId,
      week_number: weekInfo ? weekInfo.week : null,
      week_year: weekInfo ? weekInfo.year : null,
      completed,
      completed_ticket_id: completedTicket || null,
      in_progress: inProgress,
      in_progress_ticket_id: inProgressTicket || null,
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
      if (!error) {
        setStatus('Submitted. Saved to shared history.');
        await loadAllEntries();
        setTimeout(() => setStatus(''), 2500);
      } else {
        setStatus('Save failed: ' + error.message);
      }
    } catch (e) {
      setStatus('Error saving: ' + e.message);
    }
  };

  const clearForm = () => {
    setCompleted('');
    setCompletedTicket('');
    setInProgress('');
    setInProgressTicket('');
    setCats({ catDev: '', catResearch: '', catTesting: '', catDocs: '' });
    setLearned('');
    setBlocked('');
    setNextWeek('');
    setStatus('Form cleared.');
    setTimeout(() => setStatus(''), 1500);
  };

  return (
    <div className={`panel ${active ? 'active' : ''}`} id="panel-submit">
      <div className="sheet">
        <div className="meta-row">
          <div className="meta-field">
            <label>Name</label>
            <input type="text" value={currentUser} readOnly style={{ background: '#f4f4f4' }} />
          </div>
          <div className="meta-field">
            <label>Week of</label>
            <input type="date" value={weekOf} onChange={(e) => setWeekOf(e.target.value)} />
            <div className="week-label">{weekLabel}</div>
          </div>
        </div>

        <section className="first">
          <div className="section-title">✅ Completed this week</div>
          <div className="section-hint">One bullet per task/ticket. Link to Jira/PR where relevant.</div>
          <div className="meta-field" style={{ marginBottom: 8, maxWidth: 320 }}>
            <label>Related ticket (optional)</label>
            <select value={completedTicket} onChange={(e) => setCompletedTicket(e.target.value)}>
              <option value="">— none —</option>
              {myAcceptedTickets.map(t => (
                <option key={t.ticketId} value={t.ticketId}>{t.ticketId} — {t.title}</option>
              ))}
            </select>
          </div>
          <textarea placeholder="- Finished API integration for login (JIRA-142)" value={completed} onChange={(e) => setCompleted(e.target.value)} />
        </section>

        <section>
          <div className="section-title">🔄 In progress</div>
          <div className="section-hint">What's still open, % done if useful.</div>
          <div className="meta-field" style={{ marginBottom: 8, maxWidth: 320 }}>
            <label>Related ticket (optional)</label>
            <select value={inProgressTicket} onChange={(e) => setInProgressTicket(e.target.value)}>
              <option value="">— none —</option>
              {myAcceptedTickets.map(t => (
                <option key={t.ticketId} value={t.ticketId}>{t.ticketId} — {t.title}</option>
              ))}
            </select>
          </div>
          <textarea placeholder="- Dashboard redesign (~60%)" value={inProgress} onChange={(e) => setInProgress(e.target.value)} />
        </section>

        <section>
          <div className="section-title">📊 Category breakdown</div>
          <div className="section-hint">Rough hours or ticket count per category.</div>
          <div className="category-grid">
            <div className="cat"><label>Development</label><input type="number" placeholder="0" value={cats.catDev} onChange={(e) => setCats(c => ({ ...c, catDev: e.target.value }))} /></div>
            <div className="cat"><label>Research</label><input type="number" placeholder="0" value={cats.catResearch} onChange={(e) => setCats(c => ({ ...c, catResearch: e.target.value }))} /></div>
            <div className="cat"><label>Testing</label><input type="number" placeholder="0" value={cats.catTesting} onChange={(e) => setCats(c => ({ ...c, catTesting: e.target.value }))} /></div>
            <div className="cat"><label>Documentation</label><input type="number" placeholder="0" value={cats.catDocs} onChange={(e) => setCats(c => ({ ...c, catDocs: e.target.value }))} /></div>
          </div>
        </section>

        <section>
          <div className="section-title">💡 Learned / discovered</div>
          <textarea placeholder="- Found that the staging DB has stale seed data" value={learned} onChange={(e) => setLearned(e.target.value)} />
        </section>

        <section className="blocked-box">
          <div className="section-title">🚧 Blocked on</div>
          <div className="section-hint">Leave blank if nothing.</div>
          <textarea placeholder="- Waiting on design review" value={blocked} onChange={(e) => setBlocked(e.target.value)} />
        </section>

        <section>
          <div className="section-title">➡️ Next week</div>
          <textarea placeholder="- Start on payment gateway integration" value={nextWeek} onChange={(e) => setNextWeek(e.target.value)} />
        </section>

        <div className="actions">
          <button className="btn-primary" onClick={submitUpdate}>Submit Update</button>
          <button className="btn-secondary" onClick={clearForm}>Clear Form</button>
        </div>
        <div className="status">{status}</div>
      </div>
    </div>
  );
}
