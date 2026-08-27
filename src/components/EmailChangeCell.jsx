import { useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Sets profiles.email - the real address notification emails (task
// assignment, due date reminders) go to. Separate from the synthetic
// @wlyl.local login email, which is untouched by this. Written via a
// direct profiles UPDATE (admin-only per RLS, same as MemberRoleCell)
// rather than through the manage-user Edge Function, since this isn't
// an auth-level change.
export default function EmailChangeCell({ profileId, username, email, onChanged }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(email || '');
  const [fieldError, setFieldError] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const save = async () => {
    const trimmed = value.trim();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setFieldError('Enter a valid email address.');
      return;
    }
    setFieldError('');
    setSaving(true);
    try {
      const { error } = await sb.from('profiles').update({ email: trimmed || null }).eq('id', profileId);
      if (error) throw error;
      setOpen(false);
      onChanged && onChanged();
      toast({ description: `Email updated for ${username}.` });
    } catch (e) {
      toast({ variant: 'destructive', description: 'Could not update email: ' + e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <td>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {email ? 'Change email' : 'Set email'}
      </Button>
      {email && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{email}</div>}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setValue(email || ''); setFieldError(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set email for {username}</DialogTitle>
            <DialogDescription>Used for task-assignment and due-date reminder emails.</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Email address</Label>
            <Input type="email" placeholder="name@example.com" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            {fieldError && <div className="text-xs text-destructive mt-1">{fieldError}</div>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </td>
  );
}
