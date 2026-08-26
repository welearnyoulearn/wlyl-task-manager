import { useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useToast } from '@/hooks/use-toast';
import { NativeSelect } from '@/components/ui/native-select';

const ROLE_OPTIONS = [
  { value: 'developer', label: 'Developer' },
  { value: 'tester', label: 'Tester' },
  { value: 'both', label: 'Both' }
];

// Direct client write under RLS (profiles_update_member_role, admin-only)
// rather than through the manage-user Edge Function — member_role isn't
// an auth-sensitive field like password/is_admin, so it doesn't need the
// service-role path those already use.
export default function MemberRoleCell({ profileId, memberRole, onChanged }) {
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const changeRole = async (value) => {
    setSaving(true);
    try {
      const { error } = await sb.from('profiles').update({ member_role: value }).eq('id', profileId);
      if (error) throw error;
      onChanged && onChanged();
      toast({ description: 'Role updated.' });
    } catch (e) {
      toast({ variant: 'destructive', description: 'Could not update role: ' + e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <td>
      <NativeSelect
        className="h-auto w-auto py-1 px-2 text-xs"
        value={memberRole || 'both'}
        disabled={saving}
        onChange={(e) => changeRole(e.target.value)}
      >
        {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </NativeSelect>
    </td>
  );
}
