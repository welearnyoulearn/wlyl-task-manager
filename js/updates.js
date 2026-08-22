// ---------- Submit ----------
async function submitUpdate() {
  if (!currentUser) {
    document.getElementById('status').textContent = 'Please sign in above first.';
    return;
  }
  const name = document.getElementById('name').value.trim();
  const weekOf = document.getElementById('weekOf').value;
  if (!name || !weekOf) {
    document.getElementById('status').textContent = 'Please enter your name and week date.';
    return;
  }
  const completed = document.getElementById('completed').value;
  const inProgress = document.getElementById('inProgress').value;
  if (!completed.trim() && !inProgress.trim()) {
    document.getElementById('status').textContent = 'Please fill in at least "Completed" or "In progress".';
    return;
  }
  const catFields = ['catDev', 'catResearch', 'catTesting', 'catDocs'];
  const catValues = {};
  for (const id of catFields) {
    const raw = document.getElementById(id).value;
    const num = raw === '' ? 0 : Number(raw);
    if (raw !== '' && (!Number.isFinite(num) || num < 0)) {
      document.getElementById('status').textContent = 'Category values must be zero or a positive number.';
      return;
    }
    catValues[id] = num;
  }
  const weekInfo = getISOWeek(weekOf);
  const entry = {
    name, week_of: weekOf,
    week_number: weekInfo ? weekInfo.week : null,
    week_year: weekInfo ? weekInfo.year : null,
    completed,
    completed_ticket_id: document.getElementById('completedTicket').value || null,
    in_progress: inProgress,
    in_progress_ticket_id: document.getElementById('inProgressTicket').value || null,
    cat_dev: catValues.catDev,
    cat_research: catValues.catResearch,
    cat_testing: catValues.catTesting,
    cat_docs: catValues.catDocs,
    learned: document.getElementById('learned').value,
    blocked: document.getElementById('blocked').value,
    next_week: document.getElementById('nextWeek').value,
    submitted_at: new Date().toISOString()
  };
  try {
    const { error } = await sb.from('weekly_updates').upsert(entry, { onConflict: 'name,week_of' });
    if (!error) {
      document.getElementById('status').textContent = 'Submitted. Saved to shared history.';
      await loadAllEntries();
      renderMineHistory();
      setTimeout(() => document.getElementById('status').textContent = '', 2500);
    } else {
      document.getElementById('status').textContent = 'Save failed: ' + error.message;
    }
  } catch (e) {
    document.getElementById('status').textContent = 'Error saving: ' + e.message;
  }
}

function clearForm() {
  document.querySelectorAll('#panel-submit input, #panel-submit textarea').forEach(el => el.value = '');
  document.getElementById('completedTicket').value = '';
  document.getElementById('inProgressTicket').value = '';
  document.getElementById('status').textContent = 'Form cleared.';
  setTimeout(() => document.getElementById('status').textContent = '', 1500);
}

// ---------- Load all entries ----------
async function loadAllEntries() {
  try {
    const { data, error } = await sb.from('weekly_updates').select('*').order('week_of', { ascending: false });
    if (error) throw error;
    const { data: comments, error: cErr } = await sb.from('weekly_update_comments').select('*').order('created_at', { ascending: true });
    if (cErr) throw cErr;
    allEntries = (data || []).map(e => ({
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
    return allEntries;
  } catch (e) {
    document.getElementById('historyEntries').innerHTML = '<div class="empty">Could not load history: ' + e.message + '</div>';
    allEntries = [];
    return allEntries;
  }
}

// ---------- History tab ----------
function renderHistory() {
  const personFilter = document.getElementById('filterPerson');
  const weekFilter = document.getElementById('filterWeek');

  const people = [...new Set(allEntries.map(e => e.name))].sort();
  const weeks = [...new Set(allEntries.map(e => e.weekOf))].sort().reverse();

  const curPerson = personFilter.value, curWeek = weekFilter.value;
  personFilter.innerHTML = '<option value="">All</option>' + people.map(p => `<option value="${p}">${p}</option>`).join('');
  weekFilter.innerHTML = '<option value="">All</option>' + weeks.map(w => `<option value="${w}">${w}</option>`).join('');
  personFilter.value = curPerson; weekFilter.value = curWeek;

  personFilter.onchange = renderHistory;
  weekFilter.onchange = renderHistory;

  let filtered = allEntries;
  if (personFilter.value) filtered = filtered.filter(e => e.name === personFilter.value);
  if (weekFilter.value) filtered = filtered.filter(e => e.weekOf === weekFilter.value);

  // Summary cards
  const totalUpdates = filtered.length;
  const totalBlocked = filtered.filter(e => e.blocked && e.blocked.trim()).length;
  const totalDev = filtered.reduce((s,e) => s + (e.catDev||0), 0);
  const contributors = new Set(filtered.map(e => e.name)).size;
  document.getElementById('summaryRow').innerHTML = `
    <div class="summary-card"><div class="num-big">${totalUpdates}</div><div class="cap">Updates</div></div>
    <div class="summary-card"><div class="num-big">${contributors}</div><div class="cap">Contributors</div></div>
    <div class="summary-card"><div class="num-big">${totalDev}</div><div class="cap">Dev points</div></div>
    <div class="summary-card"><div class="num-big">${totalBlocked}</div><div class="cap">With blockers</div></div>
  `;

  // Table
  const body = document.getElementById('historyBody');
  if (filtered.length === 0) {
    body.innerHTML = '<tr><td colspan="8" class="empty">No updates yet.</td></tr>';
  } else {
    body.innerHTML = filtered.map(e => `
      <tr>
        <td>${escapeHtml(e.name)}</td>
        <td>${e.weekOf}</td>
        <td>${e.weekNumber ? 'W' + e.weekNumber : formatWeekLabel(e.weekOf).replace('Week ','W').split(',')[0]}</td>
        <td class="num">${e.catDev||0}</td>
        <td class="num">${e.catResearch||0}</td>
        <td class="num">${e.catTesting||0}</td>
        <td class="num">${e.catDocs||0}</td>
        <td>${e.blocked && e.blocked.trim() ? '⚠️' : '—'}</td>
        <td><button class="del-btn" onclick="deleteEntry('${e.key}')">delete</button></td>
      </tr>
    `).join('');
  }

  // Full entry cards
  const entriesDiv = document.getElementById('historyEntries');
  entriesDiv.innerHTML = filtered.map(entryCardHtml).join('') || '';
}

function entryCardHtml(e) {
  const commentsHtml = (e.comments || []).map(c => `
    <div style="border-top:1px solid var(--line); padding:8px 0; font-size:13px;">
      <div style="color:var(--muted); font-size:11px; margin-bottom:2px;">${escapeHtml(c.author)} &middot; ${new Date(c.at).toLocaleString()}</div>
      <div>${escapeHtml(c.text)}</div>
    </div>
  `).join('');
  return `
    <div class="entry-card">
      <div class="entry-head">
        <span class="entry-name">${escapeHtml(e.name)}</span>
        <span class="entry-week">${e.weekOf} &middot; ${e.weekNumber ? 'Week ' + e.weekNumber + ', ' + e.weekYear : formatWeekLabel(e.weekOf)}</span>
      </div>
      ${blockHtml('Completed', e.completed, e.completedTicketId)}
      ${blockHtml('In progress', e.inProgress, e.inProgressTicketId)}
      ${blockHtml('Learned / discovered', e.learned)}
      ${e.blocked && e.blocked.trim() ? `<div class="entry-block blocked"><div class="label">Blocked on</div><pre>${escapeHtml(e.blocked)}</pre></div>` : ''}
      ${blockHtml('Next week', e.nextWeek)}
      <div>${commentsHtml}</div>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <input type="text" id="updateComment_${e.key}" placeholder="Add a comment/reply..." style="flex:1; padding:7px 10px; border:1px solid var(--line); border-radius:6px; font-size:13px;">
        <button class="btn-secondary" style="padding:7px 14px;" onclick="addUpdateComment('${e.key}')">Post</button>
      </div>
    </div>
  `;
}

function blockHtml(label, val, ticketId) {
  if (!val || !val.trim()) return '';
  const ticketTag = ticketId ? ` <span class="ticket-link" style="font-size:11px;" onclick="openTicketDetail('${escapeHtml(ticketId)}')">[${escapeHtml(ticketId)}]</span>` : '';
  return `<div class="entry-block"><div class="label">${label}${ticketTag}</div><pre>${escapeHtml(val)}</pre></div>`;
}

async function addUpdateComment(weeklyUpdateId) {
  const input = document.getElementById('updateComment_' + weeklyUpdateId);
  const text = input.value.trim();
  if (!text) return;
  try {
    const { error } = await sb.from('weekly_update_comments').insert({
      weekly_update_id: weeklyUpdateId, author: currentUser, text
    });
    if (error) throw error;
    await loadAllEntries();
    if (document.getElementById('panel-mine').classList.contains('active')) renderMineHistory();
    if (document.getElementById('panel-history').classList.contains('active')) renderHistory();
    if (document.getElementById('panel-byperson').classList.contains('active')) renderPersonHistory();
    if (document.getElementById('panel-ticketdetail').classList.contains('active')) renderTicketDetail(currentTicketDetailId);
  } catch (e) {
    alert('Could not post comment: ' + e.message);
  }
}

async function deleteEntry(key) {
  if (!confirm('Delete this update?')) return;
  try {
    const { error } = await sb.from('weekly_updates').delete().eq('id', key);
    if (error) throw error;
    await loadAllEntries();
    renderHistory();
    renderPersonSelect();
  } catch (e) {
    alert('Could not delete: ' + e.message);
  }
}

// ---------- By person tab ----------
function renderPersonSelect() {
  const sel = document.getElementById('personSelect');
  const people = [...new Set([
    ...allEntries.map(e => e.name),
    ...allTasks.map(t => t.assignee)
  ])].sort();
  const cur = sel.value;
  sel.innerHTML = '<option value="">— choose —</option>' + people.map(p => `<option value="${p}">${p}</option>`).join('');
  sel.value = cur;
  if (cur) renderPersonHistory();
}

function renderPersonHistory() {
  const name = document.getElementById('personSelect').value;
  const div = document.getElementById('personEntries');
  if (!name) { div.innerHTML = ''; return; }
  const entries = allEntries.filter(e => e.name === name).sort((a,b) => (b.weekOf||'').localeCompare(a.weekOf||''));
  const tickets = allTasks.filter(t => t.assignee.toLowerCase() === name.toLowerCase())
    .sort((a, b) => (b.acceptedAt || b.assignedAt || '').localeCompare(a.acceptedAt || a.assignedAt || ''));

  if (entries.length === 0 && tickets.length === 0) { div.innerHTML = '<div class="empty">No updates or tickets for this person yet.</div>'; return; }

  const totalDev = entries.reduce((s,e)=>s+(e.catDev||0),0);
  const totalResearch = entries.reduce((s,e)=>s+(e.catResearch||0),0);
  const totalTesting = entries.reduce((s,e)=>s+(e.catTesting||0),0);
  const totalDocs = entries.reduce((s,e)=>s+(e.catDocs||0),0);

  const reportsHtml = entries.length === 0
    ? '<div class="empty">No weekly reports submitted yet.</div>'
    : `
      <div class="summary-row">
        <div class="summary-card"><div class="num-big">${entries.length}</div><div class="cap">Weeks logged</div></div>
        <div class="summary-card"><div class="num-big">${totalDev}</div><div class="cap">Development</div></div>
        <div class="summary-card"><div class="num-big">${totalResearch}</div><div class="cap">Research</div></div>
        <div class="summary-card"><div class="num-big">${totalTesting}</div><div class="cap">Testing</div></div>
        <div class="summary-card"><div class="num-big">${totalDocs}</div><div class="cap">Documentation</div></div>
      </div>
      ${entries.map(entryCardHtml).join('')}
    `;

  const ticketsHtml = tickets.length === 0
    ? '<div class="empty">No tickets assigned yet.</div>'
    : tickets.map(t => taskCardHtml(t, false)).join('');

  div.innerHTML = `
    <div class="section-title" style="margin-bottom:10px;">Weekly Reports</div>
    ${reportsHtml}
    <div class="section-title" style="margin:24px 0 10px;">Tickets</div>
    ${ticketsHtml}
  `;
}

