const SUPABASE_URL = 'https://qpchsvngmvpswwwjqaza.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qUcXd4zGPoeluQND5_WJpQ_7torE5Zr';
const MANAGE_USER_FN_URL = `${SUPABASE_URL}/functions/v1/manage-user`;
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let PROFILES = []; // loaded from Supabase: { id, username, is_admin }
let allEntries = [];
let allTasks = [];
let currentUser = '';
let isAdmin = false;

async function loadProfiles() {
  try {
    const { data, error } = await sb.from('profiles').select('id, username, is_admin');
    if (error) throw error;
    PROFILES = data || [];
  } catch (e) {
    PROFILES = [];
  }
  return PROFILES;
}

async function callManageUser(payload) {
  const { data: sessionData } = await sb.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Not signed in.');
  const res = await fetch(MANAGE_USER_FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Request failed.');
  return body;
}

function renderMemberList() {
  const body = document.getElementById('memberListBody');
  if (!body) return;
  const members = PROFILES.filter(p => !p.is_admin);
  if (members.length === 0) {
    body.innerHTML = '<tr><td colspan="2" class="empty">No members added yet.</td></tr>';
    return;
  }
  body.innerHTML = members.map(m => `
    <tr>
      <td>${escapeHtml(m.username)}</td>
      <td><button class="del-btn" onclick="removeMember('${escapeHtml(m.username)}')">remove</button></td>
    </tr>
  `).join('');
}

async function addMember() {
  const username = document.getElementById('newMemberUsername').value.trim().toLowerCase();
  const pw = document.getElementById('newMemberPassword').value;
  const statusEl = document.getElementById('manageMemberStatus');
  if (!username || !pw) { statusEl.textContent = 'Enter a username and password.'; return; }
  if (PROFILES.find(p => p.username === username)) { statusEl.textContent = 'That username already exists.'; return; }
  try {
    await callManageUser({ action: 'create', username, password: pw, isAdmin: false });
    await loadProfiles();
    document.getElementById('newMemberUsername').value = '';
    document.getElementById('newMemberPassword').value = '';
    statusEl.textContent = `${username} added as a member.`;
    renderMemberList();
  } catch (e) {
    statusEl.textContent = 'Error adding member: ' + e.message;
  }
}

async function removeMember(username) {
  if (!confirm(`Remove ${username}? They will no longer be able to log in.`)) return;
  try {
    await callManageUser({ action: 'remove', username });
    await loadProfiles();
    renderMemberList();
  } catch (e) {
    alert('Could not remove member: ' + e.message);
  }
}

