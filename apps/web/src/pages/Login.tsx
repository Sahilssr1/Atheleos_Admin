import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { Button, ThemeToggle } from '../components/ui';

export default function Login() {
  const { login, verifyMfa } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const submitCredentials = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const res = await login(email.trim(), password);
      if (res.mfaRequired && res.mfaToken) {
        setMfaToken(res.mfaToken);
      } else {
        navigate(from, { replace: true });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed. Please try again.');
    } finally { setBusy(false); }
  };

  const submitMfa = async (e: FormEvent) => {
    e.preventDefault();
    if (!mfaToken) return;
    setError(''); setBusy(true);
    try {
      await verifyMfa(mfaToken, code.trim());
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid verification code.');
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <div style={{ position: 'fixed', top: 14, right: 14 }}><ThemeToggle /></div>
      <div className="auth-card">
        <div className="auth-logo" aria-hidden>A</div>
        <h1 style={{ textAlign: 'center', fontSize: 20 }}>Atheleos <span className="grad-text">Admin</span></h1>
        <p className="muted small" style={{ textAlign: 'center', marginTop: 0 }}>
          Authorized administrators only. All access is logged.
        </p>
        {error && <div className="config-box" role="alert" style={{ borderColor: 'var(--danger)', background: 'var(--danger-bg)', marginBottom: 14 }}>{error}</div>}
        {!mfaToken ? (
          <form onSubmit={submitCredentials}>
            <div className="field">
              <label htmlFor="login-email">Email</label>
              <input id="login-email" className="input" type="email" required autoComplete="username"
                value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@atheleos.app" />
            </div>
            <div className="field">
              <label htmlFor="login-password">Password</label>
              <input id="login-password" className="input" type="password" required autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <Button variant="primary" className="block" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Log in'}
            </Button>
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <Link to="/reset-password" className="small">Forgot your password?</Link>
            </div>
          </form>
        ) : (
          <form onSubmit={submitMfa}>
            <p className="small muted">Enter the 6-digit code from your authenticator app.</p>
            <div className="field">
              <label htmlFor="mfa-code">Verification code</label>
              <input id="mfa-code" className="input mono" inputMode="numeric" autoComplete="one-time-code"
                required maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" autoFocus />
            </div>
            <Button variant="primary" className="block" type="submit" disabled={busy}>
              {busy ? 'Verifying…' : 'Verify & continue'}
            </Button>
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button type="button" className="btn ghost sm" onClick={() => { setMfaToken(null); setCode(''); }}>← Back to login</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
