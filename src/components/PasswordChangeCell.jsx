import { useState } from 'react';
import { callManageUser } from '../lib/supabase.js';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Confirmation Dialog + Toast (Step 6, item 15) - opening the dialog is
// itself the old "open" toggle-row state, just rendered as a Dialog
// instead of an inline row.
export default function PasswordChangeCell({ username }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const save = async () => {
    if (!pw || pw.length < 6) {
      setFieldError('Password must be at least 6 characters.');
      return;
    }
    setFieldError('');
    setSaving(true);
    try {
      await callManageUser({ action: 'set-password', username, password: pw });
      setOpen(false);
      setPw('');
      toast({ description: `Password updated for ${username}.` });
    } catch (e) {
      toast({ variant: 'destructive', description: 'Could not update password: ' + e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <td>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Change password</Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setPw(''); setFieldError(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset password for {username}?</DialogTitle>
            <DialogDescription>This immediately changes their login password.</DialogDescription>
          </DialogHeader>
          <div>
            <Label>New password</Label>
            <Input type="password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
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
