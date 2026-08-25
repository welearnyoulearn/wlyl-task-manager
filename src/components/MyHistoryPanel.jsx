import { useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import EntryCard from './EntryCard.jsx';

export default function MyHistoryPanel({ active }) {
  const { currentUser } = useAuth();
  const { allEntries, loadAllEntries } = useData();

  useEffect(() => {
    if (active) loadAllEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const mine = useMemo(() => {
    if (!currentUser) return [];
    return allEntries
      .filter(e => e.name.toLowerCase() === currentUser.toLowerCase())
      .sort((a, b) => (b.weekOf || '').localeCompare(a.weekOf || ''));
  }, [allEntries, currentUser]);

  const totals = useMemo(() => ({
    catDev: mine.reduce((s, e) => s + (e.catDev || 0), 0),
    catResearch: mine.reduce((s, e) => s + (e.catResearch || 0), 0),
    catTesting: mine.reduce((s, e) => s + (e.catTesting || 0), 0),
    catDocs: mine.reduce((s, e) => s + (e.catDocs || 0), 0)
  }), [mine]);

  return (
    <div className={`panel ${active ? 'active' : ''}`} id="panel-mine">
      <div id="mineEntries">
        {mine.length === 0 ? (
          <div className="empty">No updates submitted yet.</div>
        ) : (
          <>
            <div className="summary-row">
              <div className="summary-card"><div className="num-big">{mine.length}</div><div className="cap">Weeks logged</div></div>
              <div className="summary-card"><div className="num-big">{totals.catDev}</div><div className="cap">Development</div></div>
              <div className="summary-card"><div className="num-big">{totals.catResearch}</div><div className="cap">Research</div></div>
              <div className="summary-card"><div className="num-big">{totals.catTesting}</div><div className="cap">Testing</div></div>
              <div className="summary-card"><div className="num-big">{totals.catDocs}</div><div className="cap">Documentation</div></div>
            </div>
            {mine.map(e => <EntryCard key={e.key} entry={e} />)}
          </>
        )}
      </div>
    </div>
  );
}
