import CommentThread from './CommentThread.jsx';
import { useTicketDetail } from '../context/TicketDetailContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { sb } from '../lib/supabase.js';
import { formatWeekLabel } from '../lib/utils.js';

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

  const postComment = async (text) => {
    try {
      const { error } = await sb.from('weekly_update_comments').insert({
        weekly_update_id: entry.key, author: currentUser, text
      });
      if (error) throw error;
      await loadAllEntries();
      onChanged && onChanged();
    } catch (e) {
      alert('Could not post comment: ' + e.message);
    }
  };

  return (
    <div className="entry-card">
      <div className="entry-head">
        <span className="entry-name">{entry.name}</span>
        <span className="entry-week">
          {entry.weekOf} &middot; {entry.weekNumber ? `Week ${entry.weekNumber}, ${entry.weekYear}` : formatWeekLabel(entry.weekOf)}
        </span>
      </div>
      <Block label="Completed" val={entry.completed} ticketId={entry.completedTicketId} />
      <Block label="In progress" val={entry.inProgress} ticketId={entry.inProgressTicketId} />
      <Block label="Learned / discovered" val={entry.learned} />
      {entry.blocked && entry.blocked.trim() && (
        <div className="entry-block blocked">
          <div className="label">Blocked on</div>
          <pre>{entry.blocked}</pre>
        </div>
      )}
      <Block label="Next week" val={entry.nextWeek} />
      <CommentThread comments={entry.comments} onPost={postComment} />
    </div>
  );
}
