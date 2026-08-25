import { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext.jsx';
import EntryCard from './EntryCard.jsx';
import { sb } from '../lib/supabase.js';
import { formatWeekLabel } from '../lib/utils.js';

export default function HistoryPanel({ active }) {
  const { allEntries, loadAllEntries } = useData();
  const [personFilter, setPersonFilter] = useState('');
  const [weekFilter, setWeekFilter] = useState('');

  useEffect(() => {
    if (active) loadAllEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const people = useMemo(() => [...new Set(allEntries.map(e => e.name))].sort(), [allEntries]);
  const weeks = useMemo(() => [...new Set(allEntries.map(e => e.weekOf))].sort().reverse(), [allEntries]);

  const filtered = useMemo(() => {
    let f = allEntries;
    if (personFilter) f = f.filter(e => e.name === personFilter);
    if (weekFilter) f = f.filter(e => e.weekOf === weekFilter);
    return f;
  }, [allEntries, personFilter, weekFilter]);

  const totalUpdates = filtered.length;
  const totalBlocked = filtered.filter(e => e.blocked && e.blocked.trim()).length;
  const totalDev = filtered.reduce((s, e) => s + (e.catDev || 0), 0);
  const contributors = new Set(filtered.map(e => e.name)).size;

  const deleteEntry = async (key) => {
    if (!confirm('Delete this update?')) return;
    try {
      const { error } = await sb.from('weekly_updates').delete().eq('id', key);
      if (error) throw error;
      await loadAllEntries();
    } catch (e) {
      alert('Could not delete: ' + e.message);
    }
  };

  return (
    <div className={`panel ${active ? 'active' : ''}`} id="panel-history">
      <div className="summary-row">
        <div className="summary-card"><div className="num-big">{totalUpdates}</div><div className="cap">Updates</div></div>
        <div className="summary-card"><div className="num-big">{contributors}</div><div className="cap">Contributors</div></div>
        <div className="summary-card"><div className="num-big">{totalDev}</div><div className="cap">Dev points</div></div>
        <div className="summary-card"><div className="num-big">{totalBlocked}</div><div className="cap">With blockers</div></div>
      </div>
      <div className="filter-row">
        <div className="filter-field">
          <label>Person</label>
          <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}>
            <option value="">All</option>
            {people.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="filter-field">
          <label>Week</label>
          <select value={weekFilter} onChange={(e) => setWeekFilter(e.target.value)}>
            <option value="">All</option>
            {weeks.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div className="filter-field">
          <label style={{ visibility: 'hidden' }}>go</label>
          <button className="btn-secondary" onClick={loadAllEntries}>Refresh</button>
        </div>
      </div>
      <div className="table-scroll">
        <table id="historyTable">
          <thead>
            <tr>
              <th>Person</th><th>Week</th><th>Wk #</th>
              <th className="num">Dev</th><th className="num">Research</th><th className="num">Testing</th><th className="num">Docs</th>
              <th>Blocked</th><th></th>
            </tr>
          </thead>
          <tbody id="historyBody">
            {filtered.length === 0 ? (
              <tr><td colSpan="8" className="empty">No updates yet.</td></tr>
            ) : filtered.map(e => (
              <tr key={e.key}>
                <td>{e.name}</td>
                <td>{e.weekOf}</td>
                <td>{e.weekNumber ? 'W' + e.weekNumber : formatWeekLabel(e.weekOf).replace('Week ', 'W').split(',')[0]}</td>
                <td className="num">{e.catDev || 0}</td>
                <td className="num">{e.catResearch || 0}</td>
                <td className="num">{e.catTesting || 0}</td>
                <td className="num">{e.catDocs || 0}</td>
                <td>{e.blocked && e.blocked.trim() ? '⚠️' : '—'}</td>
                <td><button className="del-btn" onClick={() => deleteEntry(e.key)}>delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div id="historyEntries">
        {filtered.map(e => <EntryCard key={e.key} entry={e} />)}
      </div>
    </div>
  );
}
