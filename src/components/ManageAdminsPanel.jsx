import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useProfiles } from '../context/ProfilesContext.jsx';
import { callManageUser } from '../lib/supabase.js';
import PasswordChangeCell from './PasswordChangeCell.jsx';

export default function ManageAdminsPanel({ active }) {
  const { loadProfiles } = useAuth();
  const { profiles } = useProfiles();

  const [promoteSelect, setPromoteSelect] = useState('');
  const [promotePassword, setPromotePassword] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (active) loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const admins = useMemo(() => profiles.filter(p => p.is_admin), [profiles]);
  const members = useMemo(() => profiles.filter(p => !p.is_admin).map(p => p.username).sort(), [profiles]);

  const promoteMember = async () => {
    if (!promoteSelect) { setStatus('Choose a member.'); return; }
    try {
      await callManageUser({ action: 'promote', username: promoteSelect, password: promotePassword || undefined });
      await loadProfiles();
      setPromotePassword('');
      setStatus(`${promoteSelect} promoted to admin.`);
    } catch (e) {
      setStatus('Error promoting member: ' + e.message);
    }
  };

  const addAdmin = async () => {
    const name = newAdminName.trim().toLowerCase();
    if (!name || !newAdminPassword) { setStatus('Enter a name and password.'); return; }
    if (profiles.find(p => p.username === name)) { setStatus('That name is already in use.'); return; }
    try {
      await callManageUser({ action: 'create', username: name, password: newAdminPassword, isAdmin: true });
      await loadProfiles();
      setNewAdminName('');
      setNewAdminPassword('');
      setStatus(`${name} added as admin.`);
    } catch (e) {
      setStatus('Error adding admin: ' + e.message);
    }
  };

  const removeAdmin = async (username) => {
    if (admins.length === 1) {
      setStatus('Cannot remove the last admin.');
      return;
    }
    if (!confirm(`Remove ${username} as admin?`)) return;
    try {
      await callManageUser({ action: 'remove', username });
      await loadProfiles();
    } catch (e) {
      alert('Could not remove admin: ' + e.message);
    }
  };

  return (
    <div className={`panel ${active ? 'active' : ''}`} id="panel-manageadmins">
      <div className="sheet" style={{ padding: '24px 26px' }}>
        <div className="section-title" style={{ marginBottom: 4 }}>Promote an existing member</div>
        <div className="section-hint">Pick someone who has already submitted an update and make them admin.</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 24 }}>
          <div className="meta-field" style={{ maxWidth: 220 }}>
            <label>Member</label>
            <select value={promoteSelect} onChange={(e) => setPromoteSelect(e.target.value)}>
              <option value="">— choose —</option>
              {members.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="meta-field" style={{ maxWidth: 220 }}>
            <label>Set password for them</label>
            <input type="password" placeholder="Set password" value={promotePassword} onChange={(e) => setPromotePassword(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={promoteMember}>Promote to Admin</button>
        </div>

        <div className="section-title" style={{ marginBottom: 4 }}>Add a new admin</div>
        <div className="section-hint">Anyone added here can sign in with admin access using this password.</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 20 }}>
          <div className="meta-field" style={{ maxWidth: 220 }}>
            <label>Name</label>
            <input type="text" placeholder="e.g. sunny" value={newAdminName} onChange={(e) => setNewAdminName(e.target.value)} />
          </div>
          <div className="meta-field" style={{ maxWidth: 220 }}>
            <label>Password</label>
            <input type="password" placeholder="Set password" value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={addAdmin}>Add Admin</button>
        </div>
        <div className="status">{status}</div>

        <div className="section-title" style={{ marginTop: 10 }}>Current admins</div>
        <div className="table-scroll">
          <table style={{ marginTop: 8, minWidth: 0 }}>
            <thead><tr><th>Name</th><th></th><th></th></tr></thead>
            <tbody id="adminListBody">
              {admins.length === 0 ? (
                <tr><td colSpan="3" className="empty">No admins configured.</td></tr>
              ) : admins.map(a => (
                <tr key={a.id}>
                  <td>{a.username}</td>
                  <PasswordChangeCell username={a.username} />
                  <td><button className="del-btn" onClick={() => removeAdmin(a.username)}>remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
