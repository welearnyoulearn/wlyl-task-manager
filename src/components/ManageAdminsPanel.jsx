import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useProfiles } from '../context/ProfilesContext.jsx';
import { callManageUser } from '../lib/supabase.js';
import PasswordChangeCell from './PasswordChangeCell.jsx';
import EmailChangeCell from './EmailChangeCell.jsx';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';

export default function ManageAdminsPanel({ active }) {
  const { loadProfiles } = useAuth();
  const { profiles } = useProfiles();
  const { toast } = useToast();

  const [promoteSelect, setPromoteSelect] = useState('');
  const [promotePassword, setPromotePassword] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
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
      toast({ description: `${promoteSelect} promoted to admin.` });
    } catch (e) {
      setStatus('Error promoting member: ' + e.message);
      toast({ variant: 'destructive', description: 'Error promoting member: ' + e.message });
    }
  };

  const addAdmin = async () => {
    const name = newAdminName.trim().toLowerCase();
    const email = newAdminEmail.trim();
    if (!name || !newAdminPassword) { setStatus('Enter a name and password.'); return; }
    if (profiles.find(p => p.username === name)) { setStatus('That name is already in use.'); return; }
    // Required, not optional - see ManageMembersPanel's addMember for
    // why (a missing email is a silent notification gap, not a
    // recoverable-later inconvenience someone would notice).
    if (!email) { setStatus('Enter an email address - required so this admin can receive notifications.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setStatus('Enter a valid email address.'); return; }
    try {
      await callManageUser({ action: 'create', username: name, password: newAdminPassword, isAdmin: true, email });
      await loadProfiles();
      setNewAdminName('');
      setNewAdminPassword('');
      setNewAdminEmail('');
      setStatus(`${name} added as admin.`);
      toast({ description: `${name} added as admin.` });
    } catch (e) {
      setStatus('Error adding admin: ' + e.message);
      toast({ variant: 'destructive', description: 'Error adding admin: ' + e.message });
    }
  };

  const removeAdmin = async (username) => {
    try {
      await callManageUser({ action: 'remove', username });
      await loadProfiles();
      toast({ description: `${username} removed as admin.` });
    } catch (e) {
      toast({ variant: 'destructive', description: 'Could not remove admin: ' + e.message });
    }
  };

  return (
    <div className={`panel ${active ? 'active' : ''}`} id="panel-manageadmins">
      <div className="sheet" style={{ padding: '24px 26px' }}>
        <div className="section-title" style={{ marginBottom: 4 }}>Promote an existing member</div>
        <div className="section-hint">Pick someone who has already submitted an update and make them admin.</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 24 }}>
          <div className="meta-field" style={{ maxWidth: 220 }}>
            <Label>Member</Label>
            <NativeSelect value={promoteSelect} onChange={(e) => setPromoteSelect(e.target.value)}>
              <option value="">— choose —</option>
              {members.map(m => <option key={m} value={m}>{m}</option>)}
            </NativeSelect>
          </div>
          <div className="meta-field" style={{ maxWidth: 220 }}>
            <Label>Set password for them</Label>
            <PasswordInput placeholder="Set password" value={promotePassword} onChange={(e) => setPromotePassword(e.target.value)} />
          </div>
          <Button onClick={promoteMember}>Promote to Admin</Button>
        </div>

        <div className="section-title" style={{ marginBottom: 4 }}>Add a new admin</div>
        <div className="section-hint">Anyone added here can sign in with admin access using this password.</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 20 }}>
          <div className="meta-field" style={{ maxWidth: 220 }}>
            <Label>Name</Label>
            <Input type="text" placeholder="e.g. sunny" value={newAdminName} onChange={(e) => setNewAdminName(e.target.value)} />
          </div>
          <div className="meta-field" style={{ maxWidth: 220 }}>
            <Label>Password</Label>
            <PasswordInput placeholder="Set password" value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)} />
          </div>
          <div className="meta-field" style={{ maxWidth: 220 }}>
            <Label>Email</Label>
            <Input type="email" placeholder="name@example.com" value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} />
          </div>
          <Button onClick={addAdmin}>Add Admin</Button>
        </div>
        <div className="status">{status}</div>

        <div className="section-title" style={{ marginTop: 10 }}>Current admins</div>
        <div className="table-scroll">
          <table style={{ marginTop: 8, minWidth: 0 }}>
            <thead><tr><th>Name</th><th></th><th></th><th></th></tr></thead>
            <tbody id="adminListBody">
              {admins.length === 0 ? (
                <tr><td colSpan="4" className="empty">No admins configured.</td></tr>
              ) : admins.map(a => (
                <tr key={a.id}>
                  <td>{a.username}</td>
                  <EmailChangeCell profileId={a.id} username={a.username} email={a.email} onChanged={loadProfiles} />
                  <PasswordChangeCell username={a.username} />
                  <td>
                    {admins.length === 1 ? (
                      <Button variant="destructive" size="sm" disabled title="Cannot remove the last admin">Remove</Button>
                    ) : (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">Remove</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove {a.username} as admin?</AlertDialogTitle>
                            <AlertDialogDescription>
                              They will lose admin access immediately. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removeAdmin(a.username)}>Remove</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
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
