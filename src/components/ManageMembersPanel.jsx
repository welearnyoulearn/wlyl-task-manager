import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useProfiles } from '../context/ProfilesContext.jsx';
import { callManageUser, sb } from '../lib/supabase.js';
import PasswordChangeCell from './PasswordChangeCell.jsx';
import MemberRoleCell from './MemberRoleCell.jsx';

const ROLE_OPTIONS = [
  { value: 'developer', label: 'Developer' },
  { value: 'tester', label: 'Tester' },
  { value: 'both', label: 'Both' }
];

export default function ManageMembersPanel({ active }) {
  const { loadProfiles } = useAuth();
  const { profiles } = useProfiles();

  const [newMemberUsername, setNewMemberUsername] = useState('');
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('both');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (active) loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const members = useMemo(() => profiles.filter(p => !p.is_admin), [profiles]);

  const addMember = async () => {
    const username = newMemberUsername.trim().toLowerCase();
    if (!username || !newMemberPassword) { setStatus('Enter a username and password.'); return; }
    if (profiles.find(p => p.username === username)) { setStatus('That username already exists.'); return; }
    try {
      await callManageUser({ action: 'create', username, password: newMemberPassword, isAdmin: false });
      // callManageUser creates the profile row with the default
      // member_role ('both'); update it here if the admin picked
      // something else on the Add Member form.
      if (newMemberRole !== 'both') {
        const { data: created } = await sb.from('profiles').select('id').eq('username', username).single();
        if (created) await sb.from('profiles').update({ member_role: newMemberRole }).eq('id', created.id);
      }
      await loadProfiles();
      setNewMemberUsername('');
      setNewMemberPassword('');
      setNewMemberRole('both');
      setStatus(`${username} added as a member.`);
    } catch (e) {
      setStatus('Error adding member: ' + e.message);
    }
  };

  const removeMember = async (username) => {
    if (!confirm(`Remove ${username}? They will no longer be able to log in.`)) return;
    try {
      await callManageUser({ action: 'remove', username });
      await loadProfiles();
    } catch (e) {
      alert('Could not remove member: ' + e.message);
    }
  };

  return (
    <div className={`panel ${active ? 'active' : ''}`} id="panel-managemembers">
      <div className="sheet" style={{ padding: '24px 26px' }}>
        <div className="section-title" style={{ marginBottom: 4 }}>Add a team member</div>
        <div className="section-hint">Create a username and password for someone to log in and submit updates.</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 20 }}>
          <div className="meta-field" style={{ maxWidth: 220 }}>
            <label>Username</label>
            <input type="text" placeholder="e.g. priya" value={newMemberUsername} onChange={(e) => setNewMemberUsername(e.target.value)} />
          </div>
          <div className="meta-field" style={{ maxWidth: 220 }}>
            <label>Password</label>
            <input type="password" placeholder="Set password" value={newMemberPassword} onChange={(e) => setNewMemberPassword(e.target.value)} />
          </div>
          <div className="meta-field" style={{ maxWidth: 160 }}>
            <label>Role</label>
            <select value={newMemberRole} onChange={(e) => setNewMemberRole(e.target.value)}>
              {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button className="btn-primary" onClick={addMember}>Add Member</button>
        </div>
        <div className="status">{status}</div>

        <div className="section-title" style={{ marginTop: 10 }}>Current members</div>
        <div className="table-scroll">
          <table style={{ marginTop: 8, minWidth: 0 }}>
            <thead><tr><th>Username</th><th>Role</th><th></th><th></th></tr></thead>
            <tbody id="memberListBody">
              {members.length === 0 ? (
                <tr><td colSpan="4" className="empty">No members added yet.</td></tr>
              ) : members.map(m => (
                <tr key={m.id}>
                  <td>{m.username}</td>
                  <MemberRoleCell profileId={m.id} memberRole={m.member_role} onChanged={loadProfiles} />
                  <PasswordChangeCell username={m.username} />
                  <td><button className="del-btn" onClick={() => removeMember(m.username)}>remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
