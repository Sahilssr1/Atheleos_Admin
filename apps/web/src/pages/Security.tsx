import { useState } from 'react';
import type { MetricValue } from '@atheleos/shared';
import { api, ApiError } from '../lib/api';
import { useFetch } from '../hooks/useFetch';
import { fmtDate, fmtNum } from '../lib/format';
import type { SecurityOverview } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, Card, EmptyState, ErrorState, TableSkeleton } from '../components/ui';
import { useToast } from '../components/Toast';

function metricNumber(m: MetricValue | number | undefined): string {
  if (m === undefined) return 'Not available';
  if (typeof m === 'number') return fmtNum(m);
  return m.available && m.value !== null ? fmtNum(m.value) : 'Not available';
}

export default function Security() {
  const { data, loading, error, reload } = useFetch(() => api.get<SecurityOverview>('/security/overview'), []);
  const events = Array.isArray(data?.loginEvents) ? data.loginEvents : Array.isArray(data?.recentLogins) ? data.recentLogins : [];
  const sessions = Array.isArray(data?.activeSessions) ? data.activeSessions : [];
  const activeSessionsCount = typeof data?.activeSessions === 'number'
    ? data.activeSessions
    : Array.isArray(data?.activeSessions)
    ? data.activeSessions.length
    : typeof (data as unknown as { activeSessionsCount?: number })?.activeSessionsCount === 'number'
    ? (data as unknown as { activeSessionsCount: number }).activeSessionsCount
    : sessions.length;
  const permChanges = Array.isArray(data?.permissionChanges) ? data.permissionChanges : [];

  return (
    <div className="page">
      <div className="page-head">
        <h1>Security Center</h1>
        <p className="muted" style={{ margin: 0 }}>Real sign-in activity, sessions and permission changes from the admin system. Nothing here is simulated.</p>
      </div>

      <MfaSection />

      {loading && !data ? <div style={{ marginTop: 16 }}><TableSkeleton cols={4} /></div>
        : error && !data ? <div style={{ marginTop: 16 }}><ErrorState error={error} onRetry={reload} /></div>
        : data && (
          <>
            <div className="grid cols-3" style={{ marginTop: 16 }}>
              <Card className="stat-card">
                <span className="stat-label">Failed sign-in attempts</span>
                <span className="stat-value" style={{ fontSize: 22 }}>{metricNumber(data.failedAttempts24h ?? data.failedAttempts)}</span>
                <span className="stat-note">From recorded admin login events</span>
              </Card>
              <Card className="stat-card">
                <span className="stat-label">Active admin sessions</span>
                <span className="stat-value" style={{ fontSize: 22 }}>{activeSessionsCount > 0 ? fmtNum(activeSessionsCount) : 'None'}</span>
                <span className="stat-note">Sessions the API reports as active</span>
              </Card>
              <Card className="stat-card">
                <span className="stat-label">Permission changes</span>
                <span className="stat-value" style={{ fontSize: 22 }}>{fmtNum(permChanges.length)}</span>
                <span className="stat-note">Recent changes from the audit log</span>
              </Card>
            </div>

            <div className="grid cols-2" style={{ marginTop: 16, alignItems: 'start' }}>
              <Card flush>
                <div style={{ padding: '14px 16px 6px' }}><h2>Recent login activity</h2></div>
                {events.length === 0 ? <EmptyState icon="🔐" title="No login events" hint="Admin sign-ins and failures will be recorded here." /> : (
                  <div className="table-wrap"><table className="table">
                    <thead><tr><th>Admin</th><th>Result</th><th>IP</th><th>When</th></tr></thead>
                    <tbody>
                      {events.slice(0, 15).map((e, i) => (
                        <tr key={e.id ?? i}>
                          <td>{e.email ?? e.adminId ?? '—'}</td>
                          <td><Badge tone={e.success ? 'ok' : 'danger'}>{e.success ? 'Success' : 'Failed'}</Badge></td>
                          <td className="mono small">{e.ip ?? '—'}</td>
                          <td>{fmtDate(e.createdAt ?? (e as unknown as { at?: string }).at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </Card>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Card flush>
                  <div style={{ padding: '14px 16px 6px' }}><h2>Active sessions</h2></div>
                  {sessions.length === 0 ? (
                    <p className="muted small" style={{ padding: '0 16px 16px' }}>
                      The API does not expose a session list for other administrators, and there is no
                      revoke-others endpoint — so no session controls are shown. Signing out (top-right menu)
                      revokes your own session immediately.
                    </p>
                  ) : (
                    <div className="table-wrap"><table className="table">
                      <thead><tr><th>Session</th><th>Admin</th><th>Created</th><th>Expires</th></tr></thead>
                      <tbody>
                        {sessions.map((s, i) => (
                          <tr key={String(s.id ?? i)}>
                            <td className="mono small">{String(s.id ?? '—').slice(0, 12)}</td>
                            <td>{String(s.email ?? s.adminId ?? '—')}</td>
                            <td>{fmtDate((s.createdAt as string) ?? null)}</td>
                            <td>{fmtDate((s.expiresAt as string) ?? null)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                  )}
                </Card>

                <Card flush>
                  <div style={{ padding: '14px 16px 6px' }}><h2>Recent permission changes</h2></div>
                  {permChanges.length === 0 ? <EmptyState icon="🔑" title="No permission changes" hint="Role and permission edits from the audit log appear here." /> : (
                    <div className="table-wrap"><table className="table">
                      <thead><tr><th>Action</th><th>By</th><th>When</th></tr></thead>
                      <tbody>
                        {permChanges.slice(0, 10).map((p) => (
                          <tr key={p.id}><td className="mono small">{p.action}</td><td>{p.adminEmail}</td><td>{fmtDate(p.createdAt)}</td></tr>
                        ))}
                      </tbody>
                    </table></div>
                  )}
                </Card>
              </div>
            </div>
          </>
        )}
    </div>
  );
}

/** MFA (TOTP) enrolment for the signed-in administrator. */
function MfaSection() {
  const toast = useToast();
  const { user, refresh } = useAuth();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '' });

  const startSetup = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup');
      setSetup(res);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'MFA setup failed.', 'error');
    } finally { setBusy(false); }
  };

  const enable = async () => {
    setBusy(true);
    try {
      await api.post('/auth/mfa/enable', { code: code.trim() });
      toast.push('Multi-factor authentication enabled.', 'success');
      setSetup(null); setCode('');
      await refresh();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Invalid code.', 'error');
    } finally { setBusy(false); }
  };

  const disable = async () => {
    if (!code.trim()) { toast.push('Enter a current authenticator code to disable MFA.', 'error'); return; }
    setBusy(true);
    try {
      await api.post('/auth/mfa/disable', { code: code.trim() });
      toast.push('Multi-factor authentication disabled.', 'success');
      setCode('');
      await refresh();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not disable MFA.', 'error');
    } finally { setBusy(false); }
  };

  const changePassword = async () => {
    if (pw.next.length < 8) { toast.push('New password must be at least 8 characters.', 'error'); return; }
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: pw.current, newPassword: pw.next });
      toast.push('Password changed.', 'success');
      setPw({ current: '', next: '' }); setChangingPw(false);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Password change failed.', 'error');
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <h2>Your account security</h2>
      <p className="small muted">
        Signed in as <strong>{user?.email}</strong>. MFA status:{' '}
        {user?.mfaEnabled ? <Badge tone="ok">Enabled</Badge> : <Badge tone="warn">Not enabled</Badge>}
      </p>
      {!user?.mfaEnabled && !setup && (
        <Button variant="primary" onClick={startSetup} disabled={busy}>Set up authenticator (TOTP)</Button>
      )}
      {setup && (
        <div style={{ marginTop: 12 }}>
          <p className="small">Add this secret to your authenticator app (shown once), then enter a code to enable MFA:</p>
          <dl className="kv">
            <dt>Secret</dt><dd className="mono">{setup.secret}</dd>
            <dt>otpauth URI</dt><dd className="mono" style={{ fontSize: 11 }}>{setup.otpauthUrl}</dd>
          </dl>
          <div className="row" style={{ marginTop: 10, maxWidth: 340 }}>
            <input className="input mono" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Authenticator code" />
            <Button variant="primary" onClick={enable} disabled={busy || !code.trim()}>Enable MFA</Button>
          </div>
        </div>
      )}
      {user?.mfaEnabled && (
        <div className="row" style={{ marginTop: 10, maxWidth: 420 }}>
          <input className="input mono" placeholder="Current code" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Authenticator code to disable MFA" />
          <Button variant="danger-outline" onClick={disable} disabled={busy}>Disable MFA</Button>
        </div>
      )}
      <hr className="divider" />
      {!changingPw
        ? <Button size="sm" onClick={() => setChangingPw(true)}>Change password</Button>
        : (
          <div style={{ maxWidth: 380 }}>
            <div className="field"><label htmlFor="pw-cur">Current password</label>
              <input id="pw-cur" className="input" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></div>
            <div className="field"><label htmlFor="pw-new">New password</label>
              <input id="pw-new" className="input" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></div>
            <div className="row">
              <Button variant="ghost" onClick={() => setChangingPw(false)}>Cancel</Button>
              <Button variant="primary" onClick={changePassword} disabled={busy}>Change password</Button>
            </div>
          </div>
        )}
    </Card>
  );
}
