import { useAuth } from '../context/AuthContext.jsx';

export default function LoginCorner({ onOpenAuthModal }) {
  const { currentUser, isAdmin, logout } = useAuth();

  return (
    <div id="authCorner" style={{ position: 'fixed', top: 16, right: 20, zIndex: 50 }}>
      {!currentUser ? (
        <button className="btn-primary" onClick={onOpenAuthModal}>Sign in</button>
      ) : (
        <span style={{ display: 'inline-flex', fontSize: 13, background: '#fff', border: '1px solid var(--line)', borderRadius: 6, padding: '8px 12px', alignItems: 'center', gap: 8 }}>
          <span>{isAdmin ? `${currentUser} (admin)` : currentUser}</span>
          <button className="del-btn" style={{ border: 'none' }} onClick={logout}>sign out</button>
        </span>
      )}
    </div>
  );
}
