// ---------- Ticket Detail (opened by clicking any ticket id) ----------
let ticketDetailReturnTab = null;

function openTicketDetail(ticketId) {
  const activeTab = document.querySelector('.tab.active');
  ticketDetailReturnTab = activeTab || null;

  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-ticketdetail').classList.add('active');

  renderTicketDetail(ticketId);
}

function closeTicketDetail() {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  if (ticketDetailReturnTab) {
    ticketDetailReturnTab.classList.add('active');
    document.getElementById('panel-' + ticketDetailReturnTab.dataset.tab).classList.add('active');
  } else {
    document.querySelector('#tabBar .tab').classList.add('active');
    document.getElementById('panel-submit').classList.add('active');
  }
}

function renderTicketDetail(ticketId) {
  const div = document.getElementById('ticketDetailContent');
  const task = allTasks.find(t => t.ticketId === ticketId);

  if (!task) {
    div.innerHTML = '<div class="empty">Ticket not found.</div>';
    return;
  }

  const mentions = allEntries.filter(e => e.completedTicketId === ticketId || e.inProgressTicketId === ticketId)
    .sort((a, b) => (b.weekOf || '').localeCompare(a.weekOf || ''));

  const mentionsHtml = mentions.length === 0
    ? '<div class="empty">Not mentioned in any weekly report yet.</div>'
    : mentions.map(entryCardHtml).join('');

  div.innerHTML = `
    ${taskCardHtml(task, true)}
    <div class="section-title" style="margin:24px 0 10px;">Mentioned in weekly reports</div>
    ${mentionsHtml}
  `;
}
