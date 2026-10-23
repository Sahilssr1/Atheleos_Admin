import { useState } from 'react';
import { AlertTriangle, CalendarDays, FileText, Mail, MapPin, Phone } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useFetch } from '../hooks/useFetch';
import { fmtDate, fmtNum } from '../lib/format';
import type { UserDetailResponse } from '../lib/types';
import { PermissionGate } from '../auth/AuthContext';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Skeleton, StatusBadge } from '../components/ui';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { useToast } from '../components/Toast';

type Action = 'suspend' | 'reinstate' | 'restrict' | 'warn' | 'delete' | 'purge' | null;
const RESTRICTION_OPTIONS = ['posting', 'commenting', 'messaging', 'live', 'creating_events'];

export default function UserDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(() => api.get<UserDetailResponse>(`/users/${id}`), [id]);
  const [tab, setTab] = useState<'content' | 'reports' | 'restrictions' | 'support'>('content');
  const [action, setAction] = useState<Action>(null);
  const [busy, setBusy] = useState(false);
  const [warnMessage, setWarnMessage] = useState('');
  const [restrictions, setRestrictions] = useState<string[]>(['posting']);
  const [expiresAt, setExpiresAt] = useState('');

  const user = data?.user;

  const runAction = async (reason: string) => {
    if (!action || !user) return;
    setBusy(true);
    try {
      if (action === 'suspend') await api.post(`/users/${user.id}/suspend`, { reason, expiresAt: expiresAt || undefined });
      if (action === 'reinstate') await api.post(`/users/${user.id}/reinstate`, { reason });
      if (action === 'restrict') await api.post(`/users/${user.id}/restrict`, { reason, restrictions, expiresAt: expiresAt || undefined });
      if (action === 'warn') await api.post(`/users/${user.id}/warn`, { reason, message: warnMessage || reason });
      if (action === 'delete') await api.post(`/users/${user.id}/delete`, { reason });
      if (action === 'purge') await api.post(`/users/${user.id}/purge`, { reason, confirm: 'DELETE' });
      toast.push(action === 'purge' ? 'Account permanently deleted.' : `Action completed: ${action}.`, 'success');
      setAction(null);
      if (action === 'purge') navigate('/users');
      else reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Action failed.', 'error');
    } finally { setBusy(false); }
  };

  if (loading && !data) {
    return <div className="page"><Skeleton height={120} /><div style={{ height: 14 }} /><Skeleton height={300} /></div>;
  }
  if (error || !user) {
    return <div className="page"><ErrorState error={error ?? new Error('User not found')} onRetry={reload} /></div>;
  }

  return (
    <div className="page">
      <p className="small" style={{ marginTop: 0 }}><Link to="/users">← All users</Link></p>
      <Card>
        <div className="row wrap" style={{ alignItems: 'flex-start' }}>
          <Avatar src={user.avatarUrl} name={user.displayName || user.username} size={72} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="row wrap">
              <h1 style={{ margin: 0 }}>{user.displayName || '—'}</h1>
              {user.verified && <Badge tone="grad">✓ Verified</Badge>}
              <StatusBadge status={user.accountStatus} />
            </div>
            <div className="muted">@{user.username} · {user.role || 'No role'}{user.sport ? ` · ${user.sport}` : ''}</div>
            <div className="small faint mono">{user.id}</div>
            <div className="row wrap small" style={{ marginTop: 8 }}>
              <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Mail size={12} aria-hidden /> {user.email ?? 'Hidden (no contact permission)'}</span>
              {user.phone && <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Phone size={12} aria-hidden /> {user.phone}</span>}
              <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><MapPin size={12} aria-hidden /> {[user.city, user.state, user.country].filter(Boolean).join(', ') || '—'}</span>
              <span>Joined {fmtDate(user.createdAt)}</span>
            </div>
            {user.accountStatus !== 'active' && user.statusReason && (
              <p className="small" style={{ marginBottom: 0 }}>
                <strong>{user.accountStatus}:</strong> {user.statusReason}
                {user.statusExpiresAt ? ` · until ${fmtDate(user.statusExpiresAt)}` : ''}
              </p>
            )}
          </div>
          <div className="row wrap">
            <PermissionGate permission="users.warn">
              <Button size="sm" onClick={() => setAction('warn')}><AlertTriangle size={13} aria-hidden /> Warn</Button>
            </PermissionGate>
            <PermissionGate permission="users.restrict">
              <Button size="sm" onClick={() => setAction('restrict')}>Restrict</Button>
            </PermissionGate>
            <PermissionGate permission="users.suspend">
              {user.accountStatus === 'suspended'
                ? <Button size="sm" variant="primary" onClick={() => setAction('reinstate')}>Reinstate</Button>
                : <Button size="sm" variant="danger-outline" onClick={() => setAction('suspend')}>Suspend</Button>}
            </PermissionGate>
            <PermissionGate permission="users.delete">
              {user.accountStatus !== 'deleted' && <Button size="sm" variant="danger-outline" onClick={() => setAction('delete')}>Soft delete</Button>}
              <Button size="sm" variant="danger" onClick={() => setAction('purge')}>Purge</Button>
            </PermissionGate>
          </div>
        </div>
        <hr className="divider" />
        <div className="row wrap" style={{ gap: 26 }}>
          <span><strong>{fmtNum(user.followersCount)}</strong> <span className="muted">followers</span></span>
          <span><strong>{fmtNum(user.followingCount)}</strong> <span className="muted">following</span></span>
          <span><strong>{fmtNum(user.postsCount)}</strong> <span className="muted">posts</span></span>
          <span><strong>{fmtNum(user.clipsCount)}</strong> <span className="muted">clips</span></span>
          <span><strong>{fmtNum(user.reportCount)}</strong> <span className="muted">reports against</span></span>
          <span>Verification: <strong>{user.verificationStatus || 'none'}</strong></span>
        </div>
      </Card>

      <div className="tabs" role="tablist" style={{ marginTop: 18 }}>
        {(['content', 'reports', 'restrictions', 'support'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'content' ? `Content (${data.content.length})` : t === 'reports' ? `Reports (${data.reports.length})`
              : t === 'restrictions' ? `Restrictions & actions (${data.restrictions.length})` : `Support (${data.support.length})`}
          </button>
        ))}
      </div>

      {tab === 'content' && (
        (!data.content || data.content.length === 0) ? <EmptyState icon="🖼️" title="No content" hint="This user has not published posts, clips, stories or events visible to the admin API." /> : (
          <div className="media-grid">
            {data.content.map((c) => (
              <div key={`${c.type}-${c.id}`} className="media-card">
                <div className="media-thumb">
                  {c.media[0] ? (
                    (c.media[0].type.startsWith('video') || c.type === 'clip' || /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(c.media[0].url))
                      ? <video src={c.media[0].url.includes('#') ? c.media[0].url : `${c.media[0].url}#t=0.001`} poster={c.media[0].thumbnailUrl} preload="metadata" muted playsInline />
                      : <img src={c.media[0].thumbnailUrl ?? c.media[0].url} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  ) : <span className="faint" style={{ display: 'inline-flex' }}>{c.type === 'event' ? <CalendarDays size={28} /> : <FileText size={28} />}</span>}
                  <span className="media-status"><StatusBadge status={c.status} /></span>
                </div>
                <div className="media-body">
                  <div className="small" style={{ fontWeight: 600 }}>{c.type} · {fmtDate(c.createdAt)}</div>
                  <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.caption || 'No caption'}</div>
                  <Link className="small" to={`/content?type=${c.type}&focus=${c.id}`}>Open in Content →</Link>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'reports' && (
        (!data.reports || data.reports.length === 0) ? <EmptyState icon="🚩" title="No reports" hint="No reports target or were filed by this user." /> : (
          <Card flush><div className="table-wrap"><table className="table">
            <thead><tr><th>Reason</th><th>Target</th><th>Status</th><th>Filed</th></tr></thead>
            <tbody>{data.reports.map((r) => (
              <tr key={r.id}><td>{r.reason}<div className="small faint">{r.description}</div></td>
                <td>{r.targetType}/{r.targetId}</td><td><StatusBadge status={r.status} /></td><td>{fmtDate(r.createdAt)}</td></tr>
            ))}</tbody>
          </table></div></Card>
        )
      )}

      {tab === 'restrictions' && (
        (!data.restrictions || data.restrictions.length === 0) ? <EmptyState icon="📜" title="No recorded actions" hint="Suspensions, restrictions, warnings and other admin actions on this account will appear here." /> : (
          <Card flush><div className="table-wrap"><table className="table">
            <thead><tr><th>Action</th><th>Target</th><th>By</th><th>Reason</th><th>Outcome</th><th>When</th></tr></thead>
            <tbody>{data.restrictions.map((a) => (
              <tr key={a.id}>
                <td className="mono">{a.action}</td>
                <td><span className="small faint">{a.resourceType ? `${a.resourceType}${a.resourceId && a.resourceId !== user.id ? `/${a.resourceId}` : ''}` : 'account'}</span></td>
                <td>{a.adminEmail || a.adminId || '—'}</td>
                <td>{a.reason || '—'}</td>
                <td><Badge tone={a.outcome === 'success' ? 'ok' : 'danger'}>{a.outcome || 'success'}</Badge></td>
                <td>{fmtDate(a.createdAt)}</td>
              </tr>
            ))}</tbody>
          </table></div></Card>
        )
      )}

      {tab === 'support' && (
        (!data.support || data.support.length === 0) ? <EmptyState icon="🎧" title="No support tickets" hint="Support requests filed by this user will appear here." /> : (
          <Card flush><div className="table-wrap"><table className="table">
            <thead><tr><th>Subject / description</th><th>Status</th><th>Priority</th><th>Filed</th><th /></tr></thead>
            <tbody>{data.support.map((t) => (
              <tr key={t.id}><td>{t.reason}<div className="small faint">{t.description}</div></td>
                <td><StatusBadge status={t.status} /></td><td>{t.priority}</td><td>{fmtDate(t.createdAt)}</td>
                <td><Link to={`/support?focus=${t.id}`}>Open →</Link></td></tr>
            ))}</tbody>
          </table></div></Card>
        )
      )}

      {/* ── Action dialogs ─────────────────────────────────── */}
      {action === 'warn' && (
        <Dialog title={`Warn ${user.displayName}`} onClose={() => setAction(null)}>
          <div className="field">
            <label htmlFor="warn-msg">Message sent to the user</label>
            <textarea id="warn-msg" className="textarea" value={warnMessage} onChange={(e) => setWarnMessage(e.target.value)}
              placeholder="Explain the policy violation and what happens next…" />
          </div>
          <ConfirmDialogInline onCancel={() => setAction(null)} onConfirm={runAction} busy={busy}
            confirmLabel="Send warning" title="Reason for the warning (audit log)" />
        </Dialog>
      )}
      {action === 'restrict' && (
        <Dialog title={`Restrict ${user.displayName}`} onClose={() => setAction(null)}>
          <div className="field">
            <label>Restrictions to apply</label>
            {RESTRICTION_OPTIONS.map((r) => (
              <label key={r} className="checkbox-row">
                <input type="checkbox" checked={restrictions.includes(r)}
                  onChange={(e) => setRestrictions((prev) => e.target.checked ? [...prev, r] : prev.filter((x) => x !== r))} />
                {r.replace(/_/g, ' ')}
              </label>
            ))}
          </div>
          <ExpiryField value={expiresAt} onChange={setExpiresAt} />
          <ConfirmDialogInline onCancel={() => setAction(null)} onConfirm={runAction} busy={busy} confirmLabel="Apply restrictions" title="Reason" />
        </Dialog>
      )}
      {action === 'suspend' && (
        <Dialog title={`Suspend ${user.displayName}`} onClose={() => setAction(null)}>
          <p className="muted small">Suspending disables the account and the user’s Firebase sign-in until reinstated or the expiry passes.</p>
          <ExpiryField value={expiresAt} onChange={setExpiresAt} />
          <ConfirmDialogInline onCancel={() => setAction(null)} onConfirm={runAction} busy={busy} confirmLabel="Suspend account" danger title="Reason" />
        </Dialog>
      )}
      {action === 'reinstate' && (
        <ConfirmDialog title={`Reinstate ${user.displayName}?`} danger={false} busy={busy}
          description={<p className="muted small">This restores the account to active and re-enables sign-in.</p>}
          confirmLabel="Reinstate account" onCancel={() => setAction(null)} onConfirm={runAction} />
      )}
      {action === 'delete' && (
        <ConfirmDialog title={`Soft-delete ${user.displayName}?`} danger busy={busy}
          description={<p className="muted small">Soft deletion marks the account deleted and disables sign-in. The record is kept and can be reviewed; permanent removal is the separate Purge action.</p>}
          confirmLabel="Soft delete" onCancel={() => setAction(null)} onConfirm={runAction} />
      )}
      {action === 'purge' && (
        <ConfirmDialog title={`PERMANENTLY delete ${user.displayName}?`} danger busy={busy} confirmText="DELETE"
          description={<p className="muted small"><strong>This cannot be undone.</strong> The user document and the Firebase Auth account are permanently deleted. Super Admin only.</p>}
          confirmLabel="Purge account permanently" onCancel={() => setAction(null)} onConfirm={runAction} />
      )}
    </div>
  );
}

function ExpiryField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label htmlFor="expiry">Expires at (optional)</label>
      <input id="expiry" className="input" type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** Reason box + confirm row used inside the richer action dialogs above. */
function ConfirmDialogInline({ title, confirmLabel, danger, busy, onCancel, onConfirm }: {
  title: string; confirmLabel: string; danger?: boolean; busy?: boolean;
  onCancel: () => void; onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <>
      <div className="field">
        <label htmlFor="inline-reason">{title} *</label>
        <textarea id="inline-reason" className="textarea" value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Recorded in the audit log" />
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} disabled={!reason.trim() || busy} onClick={() => onConfirm(reason.trim())}>
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </>
  );
}
