import CommentThread from './CommentThread.jsx';
import { useTicketDetail } from '../context/TicketDetailContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { sb } from '../lib/supabase.js';
import { formatWeekLabel } from '../lib/utils.js';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';

function Block({ label, val, ticketId }) {
  const { openTicketDetail } = useTicketDetail();
  if (!val || !val.trim()) return null;
  return (
    <div className="entry-block">
      <div className="label">
        {label}
        {ticketId && (
          <span className="ticket-link" style={{ fontSize: 11 }} onClick={() => openTicketDetail(ticketId)}> [{ticketId}]</span>
        )}
      </div>
      <pre>{val}</pre>
    </div>
  );
}

export default function EntryCard({ entry, onChanged }) {
  const { loadAllEntries } = useData();
  const { currentUser } = useAuth();
  const { openTicketDetail } = useTicketDetail();
  const { toast } = useToast();

  const postComment = async (text) => {
    try {
      const { error } = await sb.from('weekly_update_comments').insert({
        weekly_update_id: entry.key, author: currentUser, text
      });
      if (error) throw error;
      await loadAllEntries();
      onChanged && onChanged();
    } catch (e) {
      toast({ variant: 'destructive', description: 'Could not post comment: ' + e.message });
    }
  };

  return (
    <Card className="entry-card mb-3"><CardContent className="p-4">
      <div className="entry-head">
        <span className="entry-name">{entry.name}</span>
        <span className="entry-week">
          {entry.weekOf} &middot; {entry.weekNumber ? `Week ${entry.weekNumber}, ${entry.weekYear}` : formatWeekLabel(entry.weekOf)}
        </span>
      </div>
      {entry.items && entry.items.length > 0 ? (
        <div className="entry-block">
          <div className="label">Ticket activity</div>
          {entry.items.map(i => (
            <div key={i.key} style={{ marginBottom: 6 }}>
              <span className="ticket-link" onClick={() => openTicketDetail(i.ticketId)}>[{i.ticketId}]</span>
              {i.note && <span> — {i.note}</span>}
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Old-format reports (pre-Phase-5) still show their original
              free-text Completed/In Progress fields - no backfill was
              attempted, see NOTES.md Phase 5. */}
          <Block label="Completed" val={entry.completed} ticketId={entry.completedTicketId} />
          <Block label="In progress" val={entry.inProgress} ticketId={entry.inProgressTicketId} />
        </>
      )}
      <Block label="Learned / discovered" val={entry.learned} />
      {entry.blocked && entry.blocked.trim() && (
        <div className="entry-block blocked">
          <div className="label">Blocked on</div>
          <pre>{entry.blocked}</pre>
        </div>
      )}
      <Block label="Next week" val={entry.nextWeek} />
      <CommentThread comments={entry.comments} onPost={postComment} />
    </CardContent></Card>
  );
}
