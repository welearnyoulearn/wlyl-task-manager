import { sb } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';

const SEVERITY_CLASS = {
  Blocker: 'severity-blocker',
  Major: 'severity-major',
  Minor: 'severity-minor',
  Cosmetic: 'severity-cosmetic'
};

export default function BugReportCard({ bug, task }) {
  const { currentUser, isAdmin } = useAuth();
  const { loadAllTasks } = useData();

  const canResolve = !bug.resolved && (isAdmin || currentUser.toLowerCase() === task.assignee.toLowerCase());

  const markResolved = async () => {
    try {
      const { error } = await sb.from('bug_reports').update({
        resolved: true,
        resolved_at: new Date().toISOString()
      }).eq('id', bug.key);
      if (error) throw error;
      await loadAllTasks();
    } catch (e) {
      alert('Could not mark resolved: ' + e.message);
    }
  };

  return (
    <div className={`bug-report-card ${bug.resolved ? 'resolved' : ''}`}>
      <div className="bug-report-head">
        <span>
          <span className={`severity-tag ${SEVERITY_CLASS[bug.severity] || ''}`}>{bug.severity}</span>
          {' '}
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {bug.reportedBy} &middot; {new Date(bug.createdAt).toLocaleString()}
            {bug.resolved && ` · resolved ${new Date(bug.resolvedAt).toLocaleString()}`}
          </span>
        </span>
        {canResolve && (
          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={markResolved}>Mark Resolved</button>
        )}
      </div>
      <div className="entry-block">
        <div className="label">Steps to reproduce</div>
        <pre>{bug.stepsToReproduce}</pre>
      </div>
      <div className="entry-block">
        <div className="label">Expected</div>
        <pre>{bug.expectedBehavior}</pre>
      </div>
      <div className="entry-block">
        <div className="label">Actual</div>
        <pre>{bug.actualBehavior}</pre>
      </div>
      {bug.environment && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Environment: {bug.environment}</div>
      )}
      {bug.evidenceUrl && (
        <div style={{ fontSize: 12 }}>
          <a href={bug.evidenceUrl} target="_blank" rel="noreferrer">Evidence link</a>
        </div>
      )}
    </div>
  );
}
