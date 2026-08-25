import { useState } from 'react';
import { callManageUser } from '../lib/supabase.js';

export default function PasswordChangeCell({ username }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');

  const save = async () => {
    if (!pw || pw.length < 6) {
      alert('Password must be at least 6 characters.');
      return;
    }
    try {
      await callManageUser({ action: 'set-password', username, password: pw });
      setOpen(false);
      setPw('');
      alert(`Password updated for ${username}.`);
    } catch (e) {
      alert('Could not update password: ' + e.message);
    }
  };

  return (
    <td>
      {!open ? (
        <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setOpen(true)}>change password</button>
      ) : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input
            type="password"
            placeholder="New password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoFocus
            style={{ padding: '5px 8px', fontSize: 12, border: '1px solid var(--line)', borderRadius: 6, width: 130 }}
          />
          <button className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={save}>Save</button>
          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => { setOpen(false); setPw(''); }}>Cancel</button>
        </span>
      )}
    </td>
  );
}
