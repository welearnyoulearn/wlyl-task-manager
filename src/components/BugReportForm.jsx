import { useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';

const SEVERITIES = ['Blocker', 'Major', 'Minor', 'Cosmetic'];

// Opened either from "Fail QA" (which also flips qa_status to Failed on
// submit) or from the standalone "Report Bug" button (which just logs the
// bug without touching qa_status) — see the `failsQa` prop.
export default function BugReportForm({ task, failsQa, onClose }) {
  const { currentUser } = useAuth();
  const { loadAllTasks } = useData();

  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [expectedBehavior, setExpectedBehavior] = useState('');
  const [actualBehavior, setActualBehavior] = useState('');
  const [severity, setSeverity] = useState('Major');
  const [environment, setEnvironment] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!stepsToReproduce.trim() || !expectedBehavior.trim() || !actualBehavior.trim()) {
      setStatus('Steps to reproduce, expected behavior, and actual behavior are required.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: insertErr } = await sb.from('bug_reports').insert({
        task_id: task.key,
        reported_by: currentUser,
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
      onClose();
    } catch (e) {
      setStatus('Could not submit bug report: ' + e.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="entry-block blocked" style={{ marginTop: 10 }}>
      <div className="label">{failsQa ? 'Fail QA — bug report' : 'Report a bug'}</div>
      <div className="meta-field" style={{ marginBottom: 8 }}>
        <label>Steps to reproduce</label>
        <textarea value={stepsToReproduce} onChange={(e) => setStepsToReproduce(e.target.value)} placeholder="1. Go to...&#10;2. Click..." />
      </div>
      <div className="meta-field" style={{ marginBottom: 8 }}>
        <label>Expected behavior</label>
        <textarea value={expectedBehavior} onChange={(e) => setExpectedBehavior(e.target.value)} />
      </div>
      <div className="meta-field" style={{ marginBottom: 8 }}>
        <label>Actual behavior</label>
        <textarea value={actualBehavior} onChange={(e) => setActualBehavior(e.target.value)} />
      </div>
      <div className="meta-row">
        <div className="meta-field">
          <label>Severity</label>
          <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
            {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="meta-field">
          <label>Environment (optional)</label>
          <input type="text" value={environment} onChange={(e) => setEnvironment(e.target.value)} placeholder="Chrome, desktop, preview URL" />
        </div>
      </div>
      <div className="meta-field" style={{ marginBottom: 8, maxWidth: 420 }}>
        <label>Evidence URL (optional)</label>
        <input type="text" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} placeholder="Screenshot, video, or trace link" />
      </div>
      <div className="actions" style={{ marginTop: 12 }}>
        <button className="btn-primary" onClick={submit} disabled={submitting}>
          {failsQa ? 'Submit and Fail QA' : 'Submit Bug Report'}
        </button>
        <button className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
      </div>
      {status && <div className="status">{status}</div>}
    </div>
  );
}
