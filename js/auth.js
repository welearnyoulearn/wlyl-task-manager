// ---------- Auth modal ----------
let loginMode = 'member';

function openAuthModal() {
  document.getElementById('authOverlay').style.display = 'flex';
  loadProfiles().then(() => {
    if (PROFILES.filter(p => p.is_admin).length === 0) {
      document.getElementById('setupBar').style.display = 'block';
      document.getElementById('loginBar').style.display = 'none';
    } else {
      document.getElementById('setupBar').style.display = 'none';
      document.getElementById('loginBar').style.display = 'block';
      setLoginMode('member');
    }
  });
}

function closeAuthModal() {
  document.getElementById('authOverlay').style.display = 'none';
}

function setLoginMode(mode) {
  loginMode = mode;
  document.getElementById('modeMember').classList.toggle('active', mode === 'member');
  document.getElementById('modeAdmin').classList.toggle('active', mode === 'admin');
  document.getElementById('whoAmILabel').textContent = mode === 'admin' ? 'Admin username' : 'Username';
  document.getElementById('pwFieldLabel').textContent = mode === 'admin' ? 'Admin password' : 'Password';
  document.getElementById('loginStatus').textContent = '';
}

async function logout() {
  await sb.auth.signOut();
  currentUser = '';
  isAdmin = false;
  document.getElementById('cornerLoginBtn').style.display = '';
  document.getElementById('cornerUserBadge').style.display = 'none';
  document.getElementById('appLayout').style.display = 'none';
  document.getElementById('adminSidebar').style.display = 'none';
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-submit').style.display = 'none';
  document.getElementById('landingPanel').style.display = '';
}

// ---------- First-time setup ----------
// Bootstraps the very first admin account directly via Supabase Auth
// sign-up (no Edge Function needed yet, since no admin exists to call it).
async function createFirstAdmin() {
  const name = document.getElementById('setupName').value.trim().toLowerCase();
  const pw = document.getElementById('setupPassword').value;
  const statusEl = document.getElementById('setupStatus');
  if (!name || !pw) {
    statusEl.textContent = 'Enter a name and password.';
    return;
  }
  try {
    const { data, error } = await sb.auth.signUp({
      email: toSyntheticEmail(name),
      password: pw
    });
    if (error) throw error;
    const { error: profileErr } = await sb.from('profiles').insert({
      id: data.user.id, username: name, is_admin: true
    });
    if (profileErr) throw profileErr;
    await onAuthenticated();
  } catch (e) {
    statusEl.textContent = 'Error creating admin: ' + e.message;
  }
}

// ---------- Manage admins (admin only) ----------
function renderAdminList() {
  const body = document.getElementById('adminListBody');
  if (!body) return;
  const admins = PROFILES.filter(p => p.is_admin);
  if (admins.length === 0) {
    body.innerHTML = '<tr><td colspan="2" class="empty">No admins configured.</td></tr>';
    return;
  }
  body.innerHTML = admins.map(a => `
    <tr>
      <td>${escapeHtml(a.username)}</td>
      <td><button class="del-btn" onclick="removeAdmin('${escapeHtml(a.username)}')">remove</button></td>
    </tr>
  `).join('');
  renderPromoteSelect();
}

function renderPromoteSelect() {
  const sel = document.getElementById('promoteSelect');
  if (!sel) return;
  const members = PROFILES.filter(p => !p.is_admin).map(p => p.username).sort();
  sel.innerHTML = '<option value="">— choose —</option>' + members.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
}

async function promoteMember() {
  const name = document.getElementById('promoteSelect').value;
  const pw = document.getElementById('promotePassword').value;
  const statusEl = document.getElementById('manageAdminStatus');
  if (!name) { statusEl.textContent = 'Choose a member.'; return; }
  try {
    await callManageUser({ action: 'promote', username: name, password: pw || undefined });
    await loadProfiles();
    document.getElementById('promotePassword').value = '';
    statusEl.textContent = `${name} promoted to admin.`;
    renderAdminList();
  } catch (e) {
    statusEl.textContent = 'Error promoting member: ' + e.message;
  }
}

async function addAdmin() {
  const name = document.getElementById('newAdminName').value.trim().toLowerCase();
  const pw = document.getElementById('newAdminPassword').value;
  const statusEl = document.getElementById('manageAdminStatus');
  if (!name || !pw) { statusEl.textContent = 'Enter a name and password.'; return; }
  if (PROFILES.find(p => p.username === name)) { statusEl.textContent = 'That name is already in use.'; return; }
  try {
    await callManageUser({ action: 'create', username: name, password: pw, isAdmin: true });
    await loadProfiles();
    document.getElementById('newAdminName').value = '';
    document.getElementById('newAdminPassword').value = '';
    statusEl.textContent = `${name} added as admin.`;
    renderAdminList();
  } catch (e) {
    statusEl.textContent = 'Error adding admin: ' + e.message;
  }
}

async function removeAdmin(username) {
  const admins = PROFILES.filter(p => p.is_admin);
  if (admins.length === 1) {
    document.getElementById('manageAdminStatus').textContent = 'Cannot remove the last admin.';
    return;
  }
  if (!confirm(`Remove ${username} as admin?`)) return;
  try {
    await callManageUser({ action: 'remove', username });
    await loadProfiles();
    renderAdminList();
  } catch (e) {
    alert('Could not remove admin: ' + e.message);
  }
}

// ---------- Login / identity ----------
async function loginAs() {
  const name = document.getElementById('whoAmI').value.trim().toLowerCase();
  const pw = document.getElementById('whoAmIPassword').value;
  const statusEl = document.getElementById('loginStatus');
  if (!name) {
    statusEl.textContent = 'Enter your username to continue.';
    return;
  }
  const { data, error } = await sb.auth.signInWithPassword({
    email: toSyntheticEmail(name),
    password: pw
  });
  if (error) {
    statusEl.textContent = loginMode === 'admin' ? 'Incorrect admin username or password.' : 'Incorrect username or password.';
    return;
  }
  const { data: profile } = await sb.from('profiles').select('username, is_admin').eq('id', data.user.id).single();
  if (!profile) {
    statusEl.textContent = 'Account has no profile — contact an admin.';
    await sb.auth.signOut();
    return;
  }
  if (loginMode === 'admin' && !profile.is_admin) {
    statusEl.textContent = 'That account is not an admin.';
    await sb.auth.signOut();
    return;
  }
  await onAuthenticated();
}

// Called after any successful sign-in (login form, first-time setup, or
// session restore) — reads the caller's own profile and updates the UI.
async function onAuthenticated() {
  const { data: sessionData } = await sb.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return;
  const { data: profile } = await sb.from('profiles').select('username, is_admin').eq('id', user.id).single();
  if (!profile) return;
  finishLogin(profile.username, profile.is_admin);
}

function finishLogin(name, admin) {
  currentUser = name;
  isAdmin = admin;
  document.getElementById('name').value = name;
  closeAuthModal();
  document.getElementById('cornerLoginBtn').style.display = 'none';
  document.getElementById('cornerUserBadge').style.display = 'inline-flex';
  document.getElementById('cornerUserName').textContent = admin ? `${name} (admin)` : name;
  document.getElementById('landingPanel').style.display = 'none';
  document.getElementById('appLayout').style.display = 'flex';
  document.getElementById('panel-submit').style.display = '';
  document.getElementById('panel-submit').classList.add('active');
  document.querySelector('#tabBar .tab').classList.add('active');
  document.getElementById('adminSidebar').style.display = admin ? 'flex' : 'none';
  document.getElementById('adminTab').style.display = admin ? 'block' : 'none';
  document.getElementById('adminTab2').style.display = admin ? 'block' : 'none';
  document.getElementById('adminTab3').style.display = admin ? 'block' : 'none';
  document.getElementById('adminTab4').style.display = admin ? 'block' : 'none';
  document.getElementById('adminTab5').style.display = admin ? 'block' : 'none';
  document.getElementById('adminTab6').style.display = admin ? 'block' : 'none';
  loadAllEntries().then(() => {
    renderMineHistory();
  });
  loadAllTasks().then(() => {
    renderMyTasks();
    renderMyTicketDropdowns();
  });
}
