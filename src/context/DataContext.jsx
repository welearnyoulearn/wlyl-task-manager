import { createContext, useCallback, useContext, useState } from 'react';
import { sb } from '../lib/supabase.js';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [allEntries, setAllEntries] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [entriesError, setEntriesError] = useState('');

  const loadAllEntries = useCallback(async () => {
    try {
      const { data, error } = await sb.from('weekly_updates').select('*').order('week_of', { ascending: false });
      if (error) throw error;
      const { data: comments, error: cErr } = await sb.from('weekly_update_comments').select('*').order('created_at', { ascending: true });
      if (cErr) throw cErr;
      const entries = (data || []).map(e => ({
        key: e.id,
        name: e.name,
        weekOf: e.week_of,
        weekNumber: e.week_number,
        weekYear: e.week_year,
        completed: e.completed,
        completedTicketId: e.completed_ticket_id,
        inProgress: e.in_progress,
        inProgressTicketId: e.in_progress_ticket_id,
        catDev: e.cat_dev,
        catResearch: e.cat_research,
        catTesting: e.cat_testing,
        catDocs: e.cat_docs,
        learned: e.learned,
        blocked: e.blocked,
        nextWeek: e.next_week,
        submittedAt: e.submitted_at,
        comments: (comments || []).filter(c => c.weekly_update_id === e.id).map(c => ({
          author: c.author, text: c.text, at: c.created_at
        }))
      }));
      setAllEntries(entries);
      setEntriesError('');
      return entries;
    } catch (e) {
      setEntriesError('Could not load history: ' + e.message);
      setAllEntries([]);
      return [];
    }
  }, []);

  const loadAllTasks = useCallback(async () => {
    try {
      const { data: tasks, error: tErr } = await sb.from('tasks').select('*').order('created_at', { ascending: false });
      if (tErr) throw tErr;
      const { data: comments, error: cErr } = await sb.from('task_comments').select('*').order('created_at', { ascending: true });
      if (cErr) throw cErr;
      const mapped = (tasks || []).map(t => ({
        key: t.id,
        id: t.id,
        ticketId: t.ticket_id,
        title: t.title,
        description: t.description,
        assignee: t.assignee,
        assignedBy: t.assigned_by,
        dueDate: t.due_date,
        priority: t.priority,
        status: t.status,
        assignedAt: t.assigned_at,
        acceptedAt: t.accepted_at,
        createdAt: t.created_at,
        comments: (comments || []).filter(c => c.task_id === t.id).map(c => ({
          author: c.author, text: c.text, at: c.created_at
        }))
      }));
      setAllTasks(mapped);
      return mapped;
    } catch (e) {
      setAllTasks([]);
      return [];
    }
  }, []);

  return (
    <DataContext.Provider value={{ allEntries, allTasks, entriesError, loadAllEntries, loadAllTasks }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
