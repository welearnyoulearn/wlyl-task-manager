// ---------- Tasks: load / save ----------
async function loadAllTasks() {
  try {
    const { data: tasks, error: tErr } = await sb.from('tasks').select('*').order('created_at', { ascending: false });
    if (tErr) throw tErr;
    const { data: comments, error: cErr } = await sb.from('task_comments').select('*').order('created_at', { ascending: true });
    if (cErr) throw cErr;
    allTasks = (tasks || []).map(t => ({
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
    return allTasks;
  } catch (e) {
    allTasks = [];
    return allTasks;
  }
}

// ---------- Assign task (admin) ----------
function renderTaskAssigneeSelect() {
  const sel = document.getElementById('taskAssignee');
  if (!sel) return;
  loadProfiles().then(() => {
    const uniq = [...new Set(PROFILES.map(p => p.username))].sort();
    sel.innerHTML = '<option value="">— choose person —</option>' + uniq.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
  });
}

async function assignTask() {
  const statusEl = document.getElementById('assignTaskStatus');
  const assignee = document.getElementById('taskAssignee').value;
  const title = document.getElementById('taskTitle').value.trim();
  const description = document.getElementById('taskDescription').value;
  const dueDate = document.getElementById('taskDueDate').value;
  const priority = document.getElementById('taskPriority').value;
  if (!assignee || !title) {
    statusEl.textContent = 'Choose a person and enter a task title.';
    return;
  }
  try {
    const { data, error } = await sb.from('tasks').insert({
      title, description,
      due_date: dueDate || null,
      priority,
      assignee,
      assigned_by: currentUser,
      status: 'Assigned',
      assigned_at: new Date().toISOString()
    }).select('ticket_id').single();
    if (error) throw error;
    statusEl.textContent = `Task ${data.ticket_id} assigned to ${assignee}.`;
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskDescription').value = '';
    document.getElementById('taskDueDate').value = '';
    setTimeout(() => statusEl.textContent = '', 2500);
  } catch (e) {
    statusEl.textContent = 'Error assigning task: ' + e.message;
  }
}

// ---------- My Tasks (member view) ----------
function renderMyTasks() {
  const div = document.getElementById('myTasksList');
  if (!currentUser) { div.innerHTML = ''; return; }
  const mine = allTasks.filter(t => t.assignee.toLowerCase() === currentUser.toLowerCase())
    .sort((a, b) => {
      const order = { 'Assigned': 0, 'Blocked': 1, 'In Progress': 2, 'Not Started': 3, 'Done': 4 };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });
  if (mine.length === 0) { div.innerHTML = '<div class="empty">No tasks assigned to you yet.</div>'; return; }
  div.innerHTML = mine.map(t => taskCardHtml(t, false)).join('');
}

function taskCardHtml(t, showAssignee) {
  const statusColors = {
    'Assigned': '#b57519', 'Not Started': '#6b6b6b', 'In Progress': '#1F8A70', 'Blocked': '#a83232', 'Done': '#124F41'
  };
  const commentsHtml = (t.comments || []).map(c => `
    <div style="border-top:1px solid var(--line); padding:8px 0; font-size:13px;">
      <div style="color:var(--muted); font-size:11px; margin-bottom:2px;">${escapeHtml(c.author)} &middot; ${new Date(c.at).toLocaleString()}</div>
      <div>${escapeHtml(c.text)}</div>
    </div>
  `).join('');
  const needsAccept = t.status === 'Assigned';
  const timelineHtml = `
    <div style="font-size:11px; color:var(--muted); margin-bottom:8px;">
      Assigned ${t.assignedAt ? new Date(t.assignedAt).toLocaleString() : '—'}
      ${t.acceptedAt ? ' &middot; Accepted ' + new Date(t.acceptedAt).toLocaleString() : ''}
    </div>
  `;
  return `
    <div class="entry-card">
      <div class="entry-head">
        <span class="entry-name">
          <span class="ticket-link" onclick="openTicketDetail('${escapeHtml(t.ticketId || '')}')">${escapeHtml(t.ticketId || '')}</span>
          &nbsp;${escapeHtml(t.title)} ${showAssignee ? `<span style="font-weight:400; color:var(--muted); font-size:12px;">&rarr; ${escapeHtml(t.assignee)}</span>` : ''}
        </span>
        <span class="entry-week">${t.dueDate ? 'Due ' + t.dueDate : ''}</span>
      </div>
      ${timelineHtml}
      ${t.description ? `<div class="entry-block"><pre>${escapeHtml(t.description)}</pre></div>` : ''}
      <div style="display:flex; gap:10px; align-items:center; margin:10px 0; flex-wrap:wrap;">
        <span style="font-size:12px; font-weight:600; color:${statusColors[t.status] || '#6b6b6b'};">● ${escapeHtml(t.status)}</span>
        <span style="font-size:12px; color:var(--muted);">Priority: ${escapeHtml(t.priority || 'Normal')}</span>
        ${needsAccept
          ? `<button class="btn-primary" style="padding:6px 14px; font-size:12px;" onclick="acceptTask('${t.key}')">Accept Task</button>`
          : `<select onchange="updateTaskStatus('${t.key}', this.value)" style="font-size:12px; padding:4px 6px; border:1px solid var(--line); border-radius:6px;">
              ${['Not Started','In Progress','Blocked','Done'].map(s => `<option value="${s}" ${s===t.status?'selected':''}>${s}</option>`).join('')}
            </select>`}
        ${showAssignee ? `<button class="del-btn" onclick="deleteTask('${t.key}')">delete</button>` : ''}
      </div>
      <div>${commentsHtml}</div>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <input type="text" id="comment_${t.id}" placeholder="Add a comment/update..." style="flex:1; padding:7px 10px; border:1px solid var(--line); border-radius:6px; font-size:13px;">
        <button class="btn-secondary" style="padding:7px 14px;" onclick="addTaskComment('${t.key}')">Post</button>
      </div>
    </div>
  `;
}

// ---------- Submit Update: ticket dropdowns ----------
function renderMyTicketDropdowns() {
  const completedSel = document.getElementById('completedTicket');
  const inProgressSel = document.getElementById('inProgressTicket');
  if (!completedSel || !inProgressSel) return;
  if (!currentUser) return;
  const mine = allTasks
    .filter(t => t.assignee.toLowerCase() === currentUser.toLowerCase() && t.status !== 'Assigned')
    .sort((a, b) => (b.acceptedAt || '').localeCompare(a.acceptedAt || ''));
  const options = '<option value="">— none —</option>' +
    mine.map(t => `<option value="${escapeHtml(t.ticketId)}">${escapeHtml(t.ticketId)} — ${escapeHtml(t.title)}</option>`).join('');
  const curCompleted = completedSel.value, curInProgress = inProgressSel.value;
  completedSel.innerHTML = options;
  inProgressSel.innerHTML = options;
  completedSel.value = curCompleted;
  inProgressSel.value = curInProgress;
}

async function acceptTask(key) {
  try {
    const { error } = await sb.from('tasks').update({
      status: 'Not Started',
      accepted_at: new Date().toISOString()
    }).eq('id', key);
    if (error) throw error;
    await loadAllTasks();
    if (document.getElementById('panel-mytasks').classList.contains('active')) renderMyTasks();
    if (document.getElementById('panel-tasksboard').classList.contains('active')) renderTasksBoard();
    renderMyTicketDropdowns();
  } catch (e) {
    alert('Could not accept task: ' + e.message);
  }
}

async function updateTaskStatus(key, status) {
  try {
    const { error } = await sb.from('tasks').update({ status }).eq('id', key);
    if (error) throw error;
    await loadAllTasks();
    if (document.getElementById('panel-mytasks').classList.contains('active')) renderMyTasks();
    if (document.getElementById('panel-tasksboard').classList.contains('active')) renderTasksBoard();
    renderMyTicketDropdowns();
  } catch (e) {
    alert('Could not update status: ' + e.message);
  }
}

async function addTaskComment(key) {
  const task = allTasks.find(t => t.key === key);
  if (!task) return;
  const input = document.getElementById('comment_' + task.id);
  const text = input.value.trim();
  if (!text) return;
  try {
    const { error } = await sb.from('task_comments').insert({
      task_id: key, author: currentUser, text
    });
    if (error) throw error;
    await loadAllTasks();
    if (document.getElementById('panel-mytasks').classList.contains('active')) renderMyTasks();
    if (document.getElementById('panel-tasksboard').classList.contains('active')) renderTasksBoard();
    if (document.getElementById('panel-ticketdetail').classList.contains('active')) renderTicketDetail(currentTicketDetailId);
  } catch (e) {
    alert('Could not post comment: ' + e.message);
  }
}

async function deleteTask(key) {
  if (!confirm('Delete this task?')) return;
  try {
    const { error } = await sb.from('tasks').delete().eq('id', key);
    if (error) throw error;
    await loadAllTasks();
    renderTasksBoard();
  } catch (e) {
    alert('Could not delete: ' + e.message);
  }
}

// ---------- Tasks Board (admin) ----------
function renderTasksBoard() {
  const personFilter = document.getElementById('taskFilterPerson');
  const statusFilter = document.getElementById('taskFilterStatus');

  const people = [...new Set(allTasks.map(t => t.assignee))].sort();
  const curPerson = personFilter.value;
  personFilter.innerHTML = '<option value="">All</option>' + people.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
  personFilter.value = curPerson;

  personFilter.onchange = renderTasksBoard;
  statusFilter.onchange = renderTasksBoard;

  let filtered = allTasks;
  if (personFilter.value) filtered = filtered.filter(t => t.assignee === personFilter.value);
  if (statusFilter.value) filtered = filtered.filter(t => t.status === statusFilter.value);

  const total = filtered.length;
  const awaitingAccept = filtered.filter(t => t.status === 'Assigned').length;
  const notStarted = filtered.filter(t => t.status === 'Not Started').length;
  const inProgress = filtered.filter(t => t.status === 'In Progress').length;
  const blocked = filtered.filter(t => t.status === 'Blocked').length;
  const done = filtered.filter(t => t.status === 'Done').length;
  document.getElementById('taskSummaryRow').innerHTML = `
    <div class="summary-card"><div class="num-big">${total}</div><div class="cap">Total tasks</div></div>
    <div class="summary-card"><div class="num-big">${awaitingAccept}</div><div class="cap">Awaiting accept</div></div>
    <div class="summary-card"><div class="num-big">${notStarted}</div><div class="cap">Not started</div></div>
    <div class="summary-card"><div class="num-big">${inProgress}</div><div class="cap">In progress</div></div>
    <div class="summary-card"><div class="num-big">${blocked}</div><div class="cap">Blocked</div></div>
    <div class="summary-card"><div class="num-big">${done}</div><div class="cap">Done</div></div>
  `;

  const listDiv = document.getElementById('tasksBoardList');
  if (filtered.length === 0) {
    listDiv.innerHTML = '<div class="empty">No tasks yet. Use "Assign Task" to create one.</div>';
    return;
  }
  listDiv.innerHTML = filtered.map(t => taskCardHtml(t, true)).join('');
}

