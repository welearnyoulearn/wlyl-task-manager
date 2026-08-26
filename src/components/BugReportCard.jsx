import { sb } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const SEVERITY_VARIANT = {
  Blocker: 'severityBlocker',
  Major: 'severityMajor',
  Minor: 'severityMinor',
  Cosmetic: 'severityCosmetic'
};

export default function BugReportCard({ bug, task }) {
  const { currentUser, isAdmin } = useAuth();
  const { loadAllTasks } = useData();
  const { toast } = useToast();

  const canResolve = !bug.resolved && (isAdmin || currentUser.toLowerCase() === task.assignee.toLowerCase());

  const markResolved = async () => {
    try {
      const { error } = await sb.from('bug_reports').update({
        resolved: true,
        resolved_at: new Date().toISOString()
      }).eq('id', bug.key);
      if (error) throw error;
      await loadAllTasks();
      toast({ description: 'Bug report marked resolved.' });
    } catch (e) {
      toast({ variant: 'destructive', description: 'Could not mark resolved: ' + e.message });
    }
  };

  return (
    <div className={`bug-report-card ${bug.resolved ? 'resolved' : ''}`}>
      <div className="bug-report-head">
        <span>
          <Badge className="severity-tag" variant={SEVERITY_VARIANT[bug.severity] || 'severityMinor'}>{bug.severity}</Badge>
          {' '}
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {bug.reportedBy} &middot; {new Date(bug.createdAt).toLocaleString()}
            {bug.resolved && ` · resolved ${new Date(bug.resolvedAt).toLocaleString()}`}
          </span>
        </span>
        {canResolve && (
          <Button variant="secondary" size="sm" onClick={markResolved}>Mark Resolved</Button>
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
