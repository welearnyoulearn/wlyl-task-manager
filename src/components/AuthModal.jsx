import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useProfiles } from '../context/ProfilesContext.jsx';

export default function AuthModal({ open, onClose }) {
  const { attemptLogin, createFirstAdmin, loadProfiles } = useAuth();
  const { profiles } = useProfiles();
  const [showSetup, setShowSetup] = useState(false);
  const [loginMode, setLoginMode] = useState('member');

  const [setupName, setSetupName] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupStatus, setSetupStatus] = useState('');

  const [whoAmI, setWhoAmI] = useState('');
  const [whoAmIPassword, setWhoAmIPassword] = useState('');
  const [loginStatus, setLoginStatus] = useState('');

  useEffect(() => {
    if (!open) return;
    loadProfiles().then((loaded) => {
      const hasAdmin = loaded.some(p => p.is_admin);
      setShowSetup(!hasAdmin);
      if (hasAdmin) setLoginMode('member');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const handleCreateFirstAdmin = async () => {
    const { error } = await createFirstAdmin(setupName, setupPassword);
    setSetupStatus(error || '');
  };

  const handleLogin = async () => {
    const { error } = await attemptLogin(whoAmI, whoAmIPassword, loginMode === 'admin');
    if (error) {
      setLoginStatus(error);
    } else {
      setLoginStatus('');
      setWhoAmI('');
      setWhoAmIPassword('');
    }
  };

  return (
    <div id="authOverlay" style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 60, alignItems: 'center', justifyContent: 'center' }}>
      <div className="sheet" style={{ width: 340, maxWidth: '90vw', padding: '24px 24px 28px', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 10, right: 12, border: 'none', background: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--muted)', padding: 0 }}>✕</button>

        {showSetup ? (
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>First-time setup</div>
            <div className="section-hint" style={{ marginBottom: 14 }}>No admins are configured yet. Create the first admin account.</div>
            <div className="meta-field" style={{ marginBottom: 10 }}>
              <label>Admin name</label>
              <input type="text" placeholder="e.g. sumanth" value={setupName} onChange={(e) => setSetupName(e.target.value)} />
            </div>
            <div className="meta-field" style={{ marginBottom: 14 }}>
              <label>Set password</label>
              <input type="password" placeholder="Choose a password" value={setupPassword} onChange={(e) => setSetupPassword(e.target.value)} />
            </div>
            <button className="btn-primary" style={{ width: '100%' }} onClick={handleCreateFirstAdmin}>Create Admin</button>
            <div className="status">{setupStatus}</div>
          </div>
        ) : (
          <div>
            <div className="tabs" style={{ borderBottom: '1px solid var(--line)', marginBottom: 16 }}>
              <div className={`tab ${loginMode === 'member' ? 'active' : ''}`} onClick={() => { setLoginMode('member'); setLoginStatus(''); }}>Member</div>
              <div className={`tab ${loginMode === 'admin' ? 'active' : ''}`} onClick={() => { setLoginMode('admin'); setLoginStatus(''); }}>Admin</div>
            </div>

            <div className="meta-field" style={{ marginBottom: 12 }}>
              <label>{loginMode === 'admin' ? 'Admin username' : 'Username'}</label>
              <input type="text" placeholder="Enter your username" value={whoAmI} onChange={(e) => setWhoAmI(e.target.value)} />
            </div>
            <div className="meta-field" style={{ marginBottom: 14 }}>
              <label>{loginMode === 'admin' ? 'Admin password' : 'Password'}</label>
              <input type="password" placeholder="Password" value={whoAmIPassword} onChange={(e) => setWhoAmIPassword(e.target.value)} />
            </div>
            <button className="btn-primary" style={{ width: '100%' }} onClick={handleLogin}>Continue</button>
            <div className="status">{loginStatus}</div>
          </div>
        )}
      </div>
    </div>
  );
}
