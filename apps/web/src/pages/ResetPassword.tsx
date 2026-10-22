import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { Button } from '../components/ui';

/** Combined request + reset page. With ?token=… it performs the reset. */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const requestReset = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await api.post('/auth/request-password-reset', { email: email.trim() });
      setMessage('If an admin account exists for that email, a password-reset link has been sent.');
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Request failed.');
    } finally { setBusy(false); }
  };

  const doReset = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirm) { setError('Passwords do not match.'); return; }
    setError(''); setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword });
      setMessage('Your password has been reset. You can now log in.');
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reset failed. The link may have expired.');
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo"><img src="/atheleos.png" alt="Atheleos" className="auth-logo-img" /></div>
        <h1 style={{ textAlign: 'center', fontSize: 20 }}>{token ? 'Set a new password' : 'Reset password'}</h1>
        {error && <div className="config-box" role="alert" style={{ borderColor: 'var(--danger)', background: 'var(--danger-bg)', marginBottom: 14 }}>{error}</div>}
        {done ? (
          <>
            <p className="muted" style={{ textAlign: 'center' }}>{message}</p>
            <div style={{ textAlign: 'center' }}><Link to="/login">← Back to login</Link></div>
          </>
        ) : token ? (
          <form onSubmit={doReset}>
            <div className="field">
              <label htmlFor="np">New password</label>
              <input id="np" className="input" type="password" required autoComplete="new-password"
                value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="cp">Confirm new password</label>
              <input id="cp" className="input" type="password" required autoComplete="new-password"
                value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button variant="primary" className="block" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Reset password'}</Button>
          </form>
        ) : (
          <form onSubmit={requestReset}>
            <p className="muted small">Enter your admin email and we’ll send a reset link if an account exists.</p>
            <div className="field">
              <label htmlFor="re">Email</label>
              <input id="re" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button variant="primary" className="block" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</Button>
            <div style={{ textAlign: 'center', marginTop: 14 }}><Link to="/login" className="small">← Back to login</Link></div>
          </form>
        )}
      </div>
    </div>
  );
}
