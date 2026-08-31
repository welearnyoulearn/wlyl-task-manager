import { createContext, useCallback, useContext, useState } from 'react';
import { sb } from '../lib/supabase.js';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [allEntries, setAllEntries] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [entriesError, setEntriesError] = useState('');
  const [resources, setResources] = useState([]);

  const loadAllEntries = useCallback(async () => {
    try {
      const { data, error } = await sb.from('weekly_updates').select('*').order('week_of', { ascending: false });
      if (error) throw error;
      const { data: comments, error: cErr } = await sb.from('weekly_update_comments').select('*').order('created_at', { ascending: true });
      if (cErr) throw cErr;
      const { data: items, error: iErr } = await sb.from('weekly_update_items').select('*').order('created_at', { ascending: true });
      if (iErr) throw iErr;
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
        // New-format per-ticket activity notes (Phase 5) - empty for every
        // report submitted before this migration, since weekly_update_items
        // was unused until now. Display components branch on whether this
        // array is non-empty vs. falling back to the old completed/
        // inProgress + *TicketId fields, so old reports keep rendering
        // exactly as before without erroring.
        items: (items || []).filter(i => i.weekly_update_id === e.id).map(i => ({
          key: i.id, ticketId: i.ticket_id, note: i.note
        })),
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
      const { data: tasks, error: tErr } = await sb
        .from('tasks')
        .select('*, qa_assignee_profile:profiles!qa_assignee(username)')
        .order('created_at', { ascending: false });
      if (tErr) throw tErr;
      const { data: comments, error: cErr } = await sb.from('task_comments').select('*').order('created_at', { ascending: true });
      if (cErr) throw cErr;
      const { data: bugReports, error: bErr } = await sb
        .from('bug_reports')
        .select('*, reported_by_profile:profiles!reported_by_id(username)')
        .order('created_at', { ascending: false });
      if (bErr) throw bErr;
      const { data: testEvidence, error: evErr } = await sb
        .from('test_evidence')
        .select('*, submitted_by_profile:profiles!submitted_by_id(username)')
        .order('created_at', { ascending: false });
      if (evErr) throw evErr;
      const mapped = (tasks || []).map(t => ({
        key: t.id,
        id: t.id,
        ticketId: t.ticket_id,
        title: t.title,
        description: t.description,
        descriptionFileUrl: t.description_file_url,
        descriptionFileName: t.description_file_name,
        assignee: t.assignee,
        assignedBy: t.assigned_by,
        dueDate: t.due_date,
        priority: t.priority,
        status: t.status,
        qaStatus: t.qa_status,
        assignedAt: t.assigned_at,
        acceptedAt: t.accepted_at,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        testPlan: t.test_plan,
        testPlanFileUrl: t.test_plan_file_url,
        testPlanFileName: t.test_plan_file_name,
        holdReason: t.hold_reason,
        closedAt: t.closed_at,
        closedBy: t.closed_by,
        qaAssignee: t.qa_assignee,
        qaAssigneeUsername: t.qa_assignee_profile?.username || null,
        comments: (comments || []).filter(c => c.task_id === t.id).map(c => ({
          author: c.author, text: c.text, at: c.created_at
        })),
        bugReports: (bugReports || []).filter(b => b.task_id === t.id).map(b => ({
          key: b.id,
          id: b.id,
          reportedById: b.reported_by_id,
          // Prefer the joined profiles.username (real FK) over the legacy
          // text column, which stays populated during the migration
          // transition window (see supabase/005_fk_fixes.sql) and is only
          // used here as a fallback until PART 2 of that migration drops it.
          reportedBy: b.reported_by_profile?.username || b.reported_by,
          stepsToReproduce: b.steps_to_reproduce,
          expectedBehavior: b.expected_behavior,
          actualBehavior: b.actual_behavior,
          severity: b.severity,
          environment: b.environment,
          evidenceUrl: b.evidence_url,
          evidenceUrls: b.evidence_urls || [],
          resolved: b.resolved,
          resolvedAt: b.resolved_at,
          createdAt: b.created_at
        })),
        testEvidence: (testEvidence || []).filter(ev => ev.task_id === t.id).map(ev => ({
          key: ev.id,
          id: ev.id,
          submittedById: ev.submitted_by_id,
          // Same fallback pattern as bugReports above.
          submittedBy: ev.submitted_by_profile?.username || ev.submitted_by,
          runUrl: ev.run_url,
          passedCount: ev.passed_count,
          failedCount: ev.failed_count,
          notes: ev.notes,
          createdAt: ev.created_at
        }))
      }));
      setAllTasks(mapped);
      return mapped;
    } catch (e) {
      setAllTasks([]);
      return [];
    }
  }, []);

  const loadResources = useCallback(async () => {
    try {
      const { data, error } = await sb.from('resources').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      const mapped = (data || []).map(r => ({
        key: r.id,
        title: r.title,
        body: r.body,
        linkUrl: r.link_url,
        fileUrl: r.file_url,
        fileName: r.file_name,
        createdBy: r.created_by,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }));
      setResources(mapped);
      return mapped;
    } catch (e) {
      setResources([]);
      return [];
    }
  }, []);

  return (
    <DataContext.Provider value={{ allEntries, allTasks, entriesError, loadAllEntries, loadAllTasks, resources, loadResources }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
