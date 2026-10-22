import { useState } from 'react';
import { ADMIN_ROLES, ROLE_LABELS, type AdminRole, type StaffUser } from '@atheleos/shared';
import { api, ApiError } from '../lib/api';
import { useFetch } from '../hooks/useFetch';
import { fmtDate } from '../lib/format';
import { useAuth } from '../auth/AuthContext';
import { Avatar, Badge, Button, EmptyState, ErrorState, TableSkeleton } from '../components/ui';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { useToast } from '../components/Toast';

export default function Admins() {
  const toast = useToast();
  const { user: me } = useAuth();
  const { data, loading, error, reload } = useFetch(() => api.get<StaffUser[]>('/admins'), []);
  const admins = Array.isArray(data) ? data : [];
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', role: 'support' as AdminRole, password: '' });
  const [resetting, setResetting] = useState<StaffUser | null>(null);
  const [disabling, setDisabling] = useState<StaffUser | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!form.email.trim() || !form.name.trim() || form.password.length < 8) {
      toast.push('Email, name and a password of at least 8 characters are required.', 'error'); return;
    }
    setBusy(true);
    try {
      await api.post('/admins', form);
      toast.push('Administrator created. Share the temporary password securely — they should change it and enable MFA.', 'success');
      setShowCreate(false); setForm({ email: '', name: '', role: 'support', password: '' });
      reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not create admin.', 'error');
    } finally { setBusy(false); }
  };

  const patch = async (a: StaffUser, body: Record<string, unknown>, msg: string) => {
    setBusy(true);
    try {
      await api.patch(`/admins/${a.id}`, body);
      toast.push(msg, 'success');
      reload();
    } catch (err) {
      // e.g. attempts to disable/remove the last active Super Admin are rejected by the API.
      toast.push(err instanceof ApiError ? err.message : 'Update failed.', 'error');
    } finally { setBusy(false); }
  };

  const resetPassword = async (reason: string) => {
    if (!resetting) return;
    setBusy(true);
    try {
      await api.post(`/admins/${resetting.id}/reset-password`, { reason });
      toast.push('Password reset issued. The admin must complete the reset flow / use the emailed link.', 'success');
      setResetting(null);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Reset failed.', 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="page">
      <div className="page-head row between wrap">
        <div>
          <h1>Admin Team</h1>
          <p className="muted" style={{ margin: 0 }}>Staff accounts for this panel. There is no public registration — admins are created here by an existing administrator.</p>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(true)}>+ Add administrator</Button>
      </div>

      <div className="card flush">
        {loading && !data ? <TableSkeleton cols={5} /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Administrator</th><th>Role</th><th>Status</th><th>MFA</th><th>Last login</th><th>Actions</th></tr></thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.id}>
                    <td><span className="row"><Avatar name={a.name} />
                      <span><span style={{ fontWeight: 600 }}>{a.name}</span>{a.id === me?.id && <Badge tone="info">you</Badge>}
                        <span className="small faint" style={{ display: 'block' }}>{a.email}</span></span></span></td>
                    <td>
                      <select className="select" style={{ width: 170 }} value={a.role} disabled={busy || a.id === me?.id}
                        aria-label={`Role for ${a.name}`}
                        onChange={(e) => patch(a, { role: e.target.value }, `Role updated to ${e.target.value}.`)}>
                        {ADMIN_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </td>
                    <td><Badge tone={a.status === 'active' ? 'ok' : 'danger'}>{a.status}</Badge></td>
                    <td>{a.mfaEnabled ? <Badge tone="ok">Enabled</Badge> : <Badge tone="warn">Not set up</Badge>}</td>
                    <td>{fmtDate(a.lastLoginAt)}</td>
                    <td><span className="row" style={{ gap: 4 }}>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setResetting(a)}>Reset password</Button>
                      {a.status === 'active'
                        ? <Button size="sm" variant="ghost" disabled={busy || a.id === me?.id} onClick={() => setDisabling(a)}>Disable</Button>
                        : <Button size="sm" variant="ghost" disabled={busy} onClick={() => patch(a, { status: 'active' }, 'Administrator re-enabled.')}>Enable</Button>}
                    </span></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {admins.length === 0 && <EmptyState icon="🧑‍💼" title="No administrators" hint="No staff accounts were returned by the API." />}
          </>
        )}
      </div>
      <p className="small faint">Protections: you cannot change your own role or disable yourself, and the last active Super Admin cannot be removed — the API rejects those operations and the error is shown here.</p>

      {showCreate && (
        <Dialog title="Add administrator" onClose={() => setShowCreate(false)}>
          <div className="field"><label htmlFor="ad-name">Full name *</label>
            <input id="ad-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="ad-email">Email *</label>
            <input id="ad-email" className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="field"><label htmlFor="ad-role">Role</label>
            <select id="ad-role" className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as AdminRole })}>
              {ADMIN_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select></div>
          <div className="field"><label htmlFor="ad-pw">Temporary password * (min 8 chars)</label>
            <input id="ad-pw" className="input" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create admin'}</Button>
          </div>
        </Dialog>
      )}

      {resetting && (
        <ConfirmDialog title={`Reset password for ${resetting.name}?`} busy={busy}
          description={<p className="muted small">This starts a password reset for {resetting.email}. Active sessions should be treated as compromised if this is a security response.</p>}
          confirmLabel="Issue password reset" onCancel={() => setResetting(null)} onConfirm={resetPassword} />
      )}
      {disabling && (
        <ConfirmDialog title={`Disable ${disabling.name}?`} danger busy={busy}
          description={<p className="muted small">A disabled administrator cannot sign in. Their audit history is preserved. The API blocks disabling the last active Super Admin.</p>}
          confirmLabel="Disable administrator" onCancel={() => setDisabling(null)}
          onConfirm={async () => { await patch(disabling, { status: 'disabled' }, 'Administrator disabled.'); setDisabling(null); }} />
      )}
    </div>
  );
}
