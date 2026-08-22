// ---------- Tabs ----------
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    if (!currentUser) return;
    const adminOnly = ['history', 'byperson', 'manageadmins', 'tasksboard', 'assigntask', 'managemembers'];
    if (adminOnly.includes(tab.dataset.tab) && !isAdmin) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'submit') { loadAllTasks().then(renderMyTicketDropdowns); }
    if (tab.dataset.tab === 'mine') { loadAllEntries().then(renderMineHistory); }
    if (tab.dataset.tab === 'mytasks') { loadAllTasks().then(renderMyTasks); }
    if (tab.dataset.tab === 'history') { loadAllEntries().then(renderHistory); }
    if (tab.dataset.tab === 'byperson') { Promise.all([loadAllEntries(), loadAllTasks()]).then(renderPersonSelect); }
    if (tab.dataset.tab === 'manageadmins') { loadProfiles().then(renderAdminList); }
    if (tab.dataset.tab === 'managemembers') { loadProfiles().then(renderMemberList); }
    if (tab.dataset.tab === 'tasksboard') { loadAllTasks().then(renderTasksBoard); }
    if (tab.dataset.tab === 'assigntask') { renderTaskAssigneeSelect(); }
  });
});

function renderMineHistory() {
  const div = document.getElementById('mineEntries');
  if (!currentUser) { div.innerHTML = ''; return; }
  const mine = allEntries.filter(e => e.name.toLowerCase() === currentUser.toLowerCase())
    .sort((a,b) => (b.weekOf||'').localeCompare(a.weekOf||''));
  if (mine.length === 0) { div.innerHTML = '<div class="empty">No updates submitted yet.</div>'; return; }
  const totalDev = mine.reduce((s,e)=>s+(e.catDev||0),0);
  const totalResearch = mine.reduce((s,e)=>s+(e.catResearch||0),0);
  const totalTesting = mine.reduce((s,e)=>s+(e.catTesting||0),0);
  const totalDocs = mine.reduce((s,e)=>s+(e.catDocs||0),0);
  div.innerHTML = `
    <div class="summary-row">
      <div class="summary-card"><div class="num-big">${mine.length}</div><div class="cap">Weeks logged</div></div>
      <div class="summary-card"><div class="num-big">${totalDev}</div><div class="cap">Development</div></div>
      <div class="summary-card"><div class="num-big">${totalResearch}</div><div class="cap">Research</div></div>
      <div class="summary-card"><div class="num-big">${totalTesting}</div><div class="cap">Testing</div></div>
      <div class="summary-card"><div class="num-big">${totalDocs}</div><div class="cap">Documentation</div></div>
    </div>
    ${mine.map(entryCardHtml).join('')}
  `;
}

