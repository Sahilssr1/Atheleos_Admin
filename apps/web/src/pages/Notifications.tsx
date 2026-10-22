import { useState } from 'react';
import type { Paginated } from '@atheleos/shared';
import { api, ApiError, qs } from '../lib/api';
import { useFetch, useDebounced } from '../hooks/useFetch';
import { fmtDate, fmtNum } from '../lib/format';
import type { NotificationJob } from '../lib/types';
import { PermissionGate } from '../auth/AuthContext';
import { Badge, Button, Card, EmptyState, ErrorState, Pagination, TableSkeleton } from '../components/ui';
import { ConfirmDialog } from '../components/Dialog';
import { useToast } from '../components/Toast';

const PAGE_SIZE = 25;
type AudienceKind = 'all' | 'role' | 'sport' | 'user';

export default function Notifications() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const jobs = useFetch(
    () => api.get<Paginated<NotificationJob>>(`/notifications/jobs${qs({ page, pageSize: PAGE_SIZE })}`),
    [page],
  );

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<AudienceKind>('all');
  const [role, setRole] = useState('Athlete');
  const [sport, setSport] = useState('');
  const debouncedSport = useDebounced(sport);
  const [userId, setUserId] = useState('');
  const debouncedUserId = useDebounced(userId);
  const [alsoEmail, setAlsoEmail] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  const audience = kind === 'all' ? { kind: 'all' as const }
    : kind === 'role' ? { kind: 'role' as const, role }
    : kind === 'sport' ? { kind: 'sport' as const, sport: debouncedSport }
    : { kind: 'user' as const, userId: debouncedUserId };
  const audienceReady = kind === 'all' || kind === 'role' || (kind === 'sport' && debouncedSport.trim().length > 0) || (kind === 'user' && debouncedUserId.trim().length > 0);

  const preview = useFetch(
    () => (audienceReady
      ? api.post<{ count: number }>('/notifications/preview', { audience })
      : Promise.resolve({ count: 0 })),
    [kind, role, debouncedSport, debouncedUserId],
  );

  const send = async () => {
    setSending(true);
    try {
      await api.post('/notifications/send', {
        title: title.trim(), body: body.trim(), audience,
        alsoEmail, dedupeKey: `admin-${Date.now()}`,
      });
      toast.push('Broadcast sent. Delivery progress is tracked in the job history below.', 'success');
      setConfirming(false); setTitle(''); setBody('');
      jobs.reload();
    } catch (err) {
      toast.push(err instanceof ApiError
        ? (err.code === 'DUPLICATE_NOTIFICATION' ? 'A broadcast with the same dedupe key was already sent in the last 24h.' : err.message)
        : 'Broadcast failed.', 'error');
    } finally { setSending(false); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Notifications</h1>
        <p className="muted" style={{ margin: 0 }}>Send in-app notifications to Atheleos users and review delivery history. Broadcasts always show the audience size and require confirmation.</p>
      </div>

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <PermissionGate permission="notifications.send" fallback={
          <Card><h2>Compose broadcast</h2><p className="muted small">You don’t have the notifications.send permission.</p></Card>
        }>
          <Card>
            <h2>Compose broadcast</h2>
            <div className="field">
              <label htmlFor="n-title">Title *</label>
              <input id="n-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Maintenance on Sunday" />
            </div>
            <div className="field">
              <label htmlFor="n-body">Body *</label>
              <textarea id="n-body" className="textarea" value={body} onChange={(e) => setBody(e.target.value)} placeholder="What should users know?" />
            </div>
            <div className="field">
              <label htmlFor="n-aud">Audience</label>
              <select id="n-aud" className="select" value={kind} onChange={(e) => setKind(e.target.value as AudienceKind)}>
                <option value="all">All users</option>
                <option value="role">By app role</option>
                <option value="sport">By sport</option>
                <option value="user">Single user</option>
              </select>
            </div>
            {kind === 'role' && (
              <div className="field"><label htmlFor="n-role">Role</label>
                <select id="n-role" className="select" value={role} onChange={(e) => setRole(e.target.value)}>
                  {['Athlete', 'Coach', 'Brand', 'Federation'].map((r) => <option key={r} value={r}>{r}</option>)}
                </select></div>
            )}
            {kind === 'sport' && (
              <div className="field"><label htmlFor="n-sport">Sport</label>
                <input id="n-sport" className="input" value={sport} onChange={(e) => setSport(e.target.value)} placeholder="e.g. Football" /></div>
            )}
            {kind === 'user' && (
              <div className="field"><label htmlFor="n-user">User ID</label>
                <input id="n-user" className="input mono" value={userId} onChange={(e) => setUserId(e.target.value)} /></div>
            )}
            <label className="checkbox-row" style={{ marginBottom: 12 }}>
              <input type="checkbox" checked={alsoEmail} onChange={(e) => setAlsoEmail(e.target.checked)} />
              Also send by email (queued via the app mail pipeline)
            </label>
            <div className="row between wrap">
              <span className="small muted" aria-live="polite">
                {preview.loading ? 'Counting audience…' : preview.error ? 'Audience preview unavailable'
                  : audienceReady ? <>Audience: <strong>{fmtNum(preview.data?.count)}</strong> user(s)</> : 'Complete the audience selection to preview its size.'}
              </span>
              <Button variant="primary" disabled={!title.trim() || !body.trim() || !audienceReady || (preview.data?.count ?? 0) === 0}
                onClick={() => setConfirming(true)}>
                Review & send
              </Button>
            </div>
          </Card>
        </PermissionGate>

        <Card flush>
          <div style={{ padding: '14px 16px 6px' }}><h2>Broadcast history</h2></div>
          {jobs.loading && !jobs.data ? <TableSkeleton rows={5} cols={3} /> : jobs.error && !jobs.data
            ? <ErrorState error={jobs.error} onRetry={jobs.reload} /> : (
              <>
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>Title</th><th>Delivered</th><th>Failed</th><th>When</th></tr></thead>
                  <tbody>
                    {jobs.data?.items.map((j) => (
                      <tr key={j.id}>
                        <td><span style={{ fontWeight: 600 }}>{j.title}</span>
                          <span className="small faint" style={{ display: 'block' }}>{j.body?.slice(0, 80)}</span>
                          {j.alsoEmail && <Badge tone="info">also email</Badge>}</td>
                        <td>{fmtNum(j.deliveredCount ?? j.count)}</td>
                        <td>{j.failedCount !== undefined ? fmtNum(j.failedCount) : '—'}</td>
                        <td>{fmtDate(j.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                {jobs.data && jobs.data.items.length === 0 && <EmptyState icon="🔔" title="No broadcasts yet" hint="Sent broadcasts and their delivery counts appear here." />}
                {jobs.data && <Pagination page={jobs.data.page} pageSize={jobs.data.pageSize} total={jobs.data.total} onPage={setPage} />}
              </>
            )}
        </Card>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Send this broadcast?"
          requireReason={false}
          description={(
            <div>
              <p><strong>{title}</strong></p>
              <p className="muted">{body}</p>
              <p className="small">Audience: <strong>{fmtNum(preview.data?.count)} user(s)</strong> ({kind}{kind === 'role' ? `: ${role}` : kind === 'sport' ? `: ${sport}` : kind === 'user' ? `: ${userId}` : ''})
                {alsoEmail ? ' · also by email' : ''}. A duplicate-protection key is attached for 24h.</p>
            </div>
          )}
          confirmLabel={`Send to ${fmtNum(preview.data?.count)} users`}
          busy={sending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void send()}
        />
      )}
    </div>
  );
}
