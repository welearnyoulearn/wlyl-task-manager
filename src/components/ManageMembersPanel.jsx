import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useProfiles } from '../context/ProfilesContext.jsx';
import { callManageUser, sb } from '../lib/supabase.js';
import PasswordChangeCell from './PasswordChangeCell.jsx';
import MemberRoleCell from './MemberRoleCell.jsx';
import EmailChangeCell from './EmailChangeCell.jsx';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';

const ROLE_OPTIONS = [
  { value: 'developer', label: 'Developer' },
  { value: 'tester', label: 'Tester' },
  { value: 'both', label: 'Both' }
];

export default function ManageMembersPanel({ active }) {
  const { loadProfiles } = useAuth();
  const { profiles } = useProfiles();
  const { toast } = useToast();

  const [newMemberUsername, setNewMemberUsername] = useState('');
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('both');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (active) loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const members = useMemo(() => profiles.filter(p => !p.is_admin), [profiles]);

  const addMember = async () => {
    const username = newMemberUsername.trim().toLowerCase();
    const email = newMemberEmail.trim();
    if (!username || !newMemberPassword) { setStatus('Enter a username and password.'); return; }
    if (profiles.find(p => p.username === username)) { setStatus('That username already exists.'); return; }
    // Email is required, not optional - without it this person can
    // never receive task-assignment/due-date notification emails, and
    // that gap would otherwise be silent (no error, they just never
    // get mail) until an admin happens to notice and sets it later.
    if (!email) { setStatus('Enter an email address - required so this member can receive notifications.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setStatus('Enter a valid email address.'); return; }
    try {
      await callManageUser({ action: 'create', username, password: newMemberPassword, isAdmin: false, email });
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
      setNewMemberEmail('');
      setStatus(`${username} added as a member.`);
      toast({ description: `${username} added as a member.` });
    } catch (e) {
      setStatus('Error adding member: ' + e.message);
      toast({ variant: 'destructive', description: 'Error adding member: ' + e.message });
    }
  };

  const removeMember = async (username) => {
    try {
      await callManageUser({ action: 'remove', username });
      await loadProfiles();
      toast({ description: `${username} removed.` });
    } catch (e) {
      toast({ variant: 'destructive', description: 'Could not remove member: ' + e.message });
    }
  };

  return (
    <div className={`panel ${active ? 'active' : ''}`} id="panel-managemembers">
      <div className="sheet" style={{ padding: '24px 26px' }}>
        <div className="section-title" style={{ marginBottom: 4 }}>Add a team member</div>
        <div className="section-hint">Create a username and password for someone to log in and submit updates.</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 20 }}>
          <div className="meta-field" style={{ maxWidth: 220 }}>
            <Label>Username</Label>
            <Input type="text" placeholder="e.g. priya" value={newMemberUsername} onChange={(e) => setNewMemberUsername(e.target.value)} />
          </div>
          <div className="meta-field" style={{ maxWidth: 220 }}>
            <Label>Password</Label>
            <Input type="password" placeholder="Set password" value={newMemberPassword} onChange={(e) => setNewMemberPassword(e.target.value)} />
          </div>
          <div className="meta-field" style={{ maxWidth: 160 }}>
            <Label>Role</Label>
            <NativeSelect value={newMemberRole} onChange={(e) => setNewMemberRole(e.target.value)}>
              {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </NativeSelect>
          </div>
          <div className="meta-field" style={{ maxWidth: 220 }}>
            <Label>Email</Label>
            <Input type="email" placeholder="name@example.com" value={newMemberEmail} onChange={(e) => setNewMemberEmail(e.target.value)} />
          </div>
          <Button onClick={addMember}>Add Member</Button>
        </div>
        <div className="status">{status}</div>

        <div className="section-title" style={{ marginTop: 10 }}>Current members</div>
        <div className="table-scroll">
          <table style={{ marginTop: 8, minWidth: 0 }}>
            <thead><tr><th>Username</th><th>Role</th><th></th><th></th><th></th></tr></thead>
            <tbody id="memberListBody">
              {members.length === 0 ? (
                <tr><td colSpan="5" className="empty">No members added yet.</td></tr>
              ) : members.map(m => (
                <tr key={m.id}>
                  <td>{m.username}</td>
                  <MemberRoleCell profileId={m.id} memberRole={m.member_role} onChanged={loadProfiles} />
                  <EmailChangeCell profileId={m.id} username={m.username} email={m.email} onChanged={loadProfiles} />
                  <PasswordChangeCell username={m.username} />
                  <td>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">Remove</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove {m.username}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            They will no longer be able to log in. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => removeMember(m.username)}>Remove</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
