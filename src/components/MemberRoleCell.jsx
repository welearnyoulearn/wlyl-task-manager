import { useState } from 'react';
import { sb } from '../lib/supabase.js';

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

  const changeRole = async (value) => {
    setSaving(true);
    try {
      const { error } = await sb.from('profiles').update({ member_role: value }).eq('id', profileId);
      if (error) throw error;
      onChanged && onChanged();
    } catch (e) {
      alert('Could not update role: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <td>
      <select
        value={memberRole || 'both'}
        disabled={saving}
        onChange={(e) => changeRole(e.target.value)}
        style={{ fontSize: 12, padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 6 }}
      >
        {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </td>
  );
}
