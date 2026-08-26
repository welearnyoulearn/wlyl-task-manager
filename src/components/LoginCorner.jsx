import { useAuth } from '../context/AuthContext.jsx';
import { Button } from '@/components/ui/button';

export default function LoginCorner({ onOpenAuthModal }) {
  const { currentUser, isAdmin, logout } = useAuth();

  return (
    <div id="authCorner" style={{ position: 'fixed', top: 16, right: 20, zIndex: 50 }}>
      {!currentUser ? (
        <Button id="cornerLoginBtn" onClick={onOpenAuthModal}>Sign in</Button>
      ) : (
        <span id="cornerUserBadge" style={{ display: 'inline-flex', fontSize: 13, background: '#fff', border: '1px solid var(--line)', borderRadius: 6, padding: '8px 12px', alignItems: 'center', gap: 8 }}>
          <span>{isAdmin ? `${currentUser} (admin)` : currentUser}</span>
          <Button variant="ghost" size="sm" onClick={logout}>Sign out</Button>
        </span>
      )}
    </div>
  );
}
