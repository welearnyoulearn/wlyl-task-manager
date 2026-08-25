import { useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';

export default function TestEvidenceForm({ task, onClose }) {
  const { currentUser, currentUserId } = useAuth();
  const { loadAllTasks } = useData();

  const [runUrl, setRunUrl] = useState('');
  const [passedCount, setPassedCount] = useState('');
  const [failedCount, setFailedCount] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!runUrl.trim()) {
      setStatus('A CI/trace URL is required.');
      return;
    }
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
      onClose();
    } catch (e) {
      setStatus('Could not attach test run: ' + e.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="entry-block" style={{ marginTop: 10, background: 'var(--accent-bg)', padding: '10px 12px', borderRadius: 6, borderLeft: '3px solid var(--accent)' }}>
      <div className="label">Attach test run</div>
      <div className="meta-field" style={{ marginBottom: 8, maxWidth: 420 }}>
        <label>CI / trace URL</label>
        <input type="text" value={runUrl} onChange={(e) => setRunUrl(e.target.value)} placeholder="https://github.com/.../actions/runs/..." />
      </div>
      <div className="meta-row">
        <div className="meta-field">
          <label>Passed</label>
          <input type="number" value={passedCount} onChange={(e) => setPassedCount(e.target.value)} placeholder="0" />
        </div>
        <div className="meta-field">
          <label>Failed</label>
          <input type="number" value={failedCount} onChange={(e) => setFailedCount(e.target.value)} placeholder="0" />
        </div>
      </div>
      <div className="meta-field" style={{ marginBottom: 8 }}>
        <label>Notes (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="actions" style={{ marginTop: 12 }}>
        <button className="btn-primary" onClick={submit} disabled={submitting}>Attach</button>
        <button className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
      </div>
      {status && <div className="status">{status}</div>}
    </div>
  );
}
