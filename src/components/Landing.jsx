import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function LoginBox({ role, title, icon, hint, open, onToggle, onOpenSetup }) {
  const { attemptLogin } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Login failure surfaces as inline text under the form (item 20) - not
  // a silent no-op. attemptLogin's error string comes straight from
  // Supabase Auth ("Invalid login credentials" etc.), shown as-is.
  const submit = async () => {
    setSubmitting(true);
    const { error } = await attemptLogin(username, password, role === 'admin');
    if (error) {
      setStatus(error);
    } else {
      setStatus('');
      setUsername('');
      setPassword('');
    }
    setSubmitting(false);
  };

  return (
    <div id={`${role}Box`} className={`landing-login-box ${open ? 'open' : ''}`}>
      <div className="landing-login-box-header" onClick={onToggle}>
        <div className="landing-login-box-icon">{icon}</div>
        <div>
          <div className="landing-login-box-title">{title}</div>
          <div className="landing-login-box-hint">{hint}</div>
        </div>
        <span className={`landing-login-chevron ${open ? 'open' : ''}`}>&rsaquo;</span>
      </div>
      {open && (
        <div className="landing-login-fields">
          <div className="meta-field" style={{ marginBottom: 10, textAlign: 'left' }}>
            <Label>{role === 'admin' ? 'Admin username' : 'Username'}</Label>
            <Input
              type="text"
              placeholder={role === 'admin' ? 'Enter your admin username' : 'Enter your username'}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>
          <div className="meta-field" style={{ marginBottom: 14, textAlign: 'left' }}>
            <Label>Password</Label>
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            />
          </div>
          <Button style={{ width: '100%' }} onClick={submit} disabled={submitting}>
            Sign in as {title}
          </Button>
          {status && <div className="text-sm text-destructive mt-2">{status}</div>}
        </div>
      )}
    </div>
  );
}

export default function Landing({ onOpenSetup }) {
  const [openBox, setOpenBox] = useState(null); // 'member' | 'admin' | null

  return (
    <div id="landingPanel" className="landing">
      <div className="landing-manifesto">
        <div className="landing-eyebrow">WLYL Hub</div>
        <h2 className="landing-headline">Small updates.<br />Compounding progress.</h2>
        <p className="landing-sub">Every task logged and every ticket closed adds up. This is where the team's week becomes the team's momentum.</p>

        <div className="landing-quotes">
          <blockquote className="landing-quote landing-quote-lead">
            <p>&ldquo;Every update tells a part of our journey. By recording what we do, sharing our progress, and learning from each week, we turn small contributions into meaningful results and build a stronger future together.&rdquo;</p>
          </blockquote>
          <div className="landing-quote-pair">
            <blockquote className="landing-quote">
              <p>&ldquo;Great things are built through consistent progress.&rdquo;</p>
            </blockquote>
            <blockquote className="landing-quote">
              <p>&ldquo;Keep moving forward — every update is a step toward success.&rdquo;</p>
            </blockquote>
          </div>
        </div>
      </div>

      <div className="landing-access">
        <div className="landing-access-card">
          <div className="landing-access-title">Sign in</div>
          <div className="landing-access-hint">Choose how you're joining this week.</div>

          <div className="landing-login-grid">
            <LoginBox
              role="member"
              title="Member"
              icon="◐"
              hint="Submit updates, track your tasks"
              open={openBox === 'member'}
              onToggle={() => setOpenBox(openBox === 'member' ? null : 'member')}
            />
            <LoginBox
              role="admin"
              title="Admin"
              icon="◆"
              hint="Manage tasks, tickets, the team"
              open={openBox === 'admin'}
              onToggle={() => setOpenBox(openBox === 'admin' ? null : 'admin')}
            />
          </div>

          <div className="landing-setup-link">
            First time here?{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); onOpenSetup(); }}>Set up the first admin account</a>.
          </div>
        </div>
      </div>
    </div>
  );
}
