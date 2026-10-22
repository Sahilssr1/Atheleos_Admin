import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Paginated, ReportItem } from '@atheleos/shared';
import { api, ApiError, qs } from '../lib/api';
import { useFetch, useDebounced } from '../hooks/useFetch';
import { fmtDate } from '../lib/format';
import { PermissionGate } from '../auth/AuthContext';
import { Badge, Button, EmptyState, ErrorState, Pagination, SearchInput, StatusBadge, TableSkeleton } from '../components/ui';
import { Drawer } from '../components/Dialog';
import { useToast } from '../components/Toast';

const PAGE_SIZE = 25;
const TICKET_STATUSES = ['new', 'under_review', 'escalated', 'action_taken', 'dismissed', 'closed'];

/** Support desk — tickets are the app's reports collection (Report a Problem / Contact Support). */
export default function Support() {
  const toast = useToast();
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('focus'));
  const [reply, setReply] = useState('');
  const [via, setVia] = useState<'inapp' | 'email' | 'both'>('both');
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useFetch(
    () => api.get<Paginated<ReportItem>>(`/support/tickets${qs({ status, q: debouncedQ, page, pageSize: PAGE_SIZE })}`),
    [status, debouncedQ, page],
  );
  const detail = useFetch(
    () => (selectedId ? api.get<ReportItem>(`/support/tickets/${selectedId}`) : Promise.resolve(null)),
    [selectedId],
  );
  const ticket = detail.data;

  const patch = async (body: Record<string, unknown>, msg: string) => {
    if (!ticket) return;
    setBusy(true);
    try {
      await api.patch(`/support/tickets/${ticket.id}`, body);
      toast.push(msg, 'success');
      reload(); detail.reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Update failed.', 'error');
    } finally { setBusy(false); }
  };

  const sendReply = async () => {
    if (!ticket || !reply.trim()) return;
    setBusy(true);
    try {
      await api.post(`/support/tickets/${ticket.id}/reply`, { message: reply.trim(), via });
      toast.push('Reply sent to the user.', 'success');
      setReply('');
      detail.reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Reply failed.', 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Support tickets</h1>
        <p className="muted" style={{ margin: 0 }}>Requests from the app’s “Report a Problem / Contact Support” flow. Replies go out as an in-app notification and/or email.</p>
      </div>

      <div className="filters">
        <div className="grow"><SearchInput placeholder="Search tickets…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search tickets" /></div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="s-status">Status</label>
          <select id="s-status" className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {TICKET_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>

      <div className="card flush">
        {loading && !data ? <TableSkeleton cols={6} /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Ticket</th><th>From user</th><th>Category</th><th>Priority</th><th>Status</th><th>Assigned</th><th>Filed</th></tr></thead>
              <tbody>
                {data?.items.map((t) => (
                  <tr key={t.id} className="clickable" onClick={() => setSelectedId(t.id)}>
                    <td style={{ maxWidth: 320 }}><span style={{ fontWeight: 600 }}>{t.reason}</span>
                      <span className="small faint" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</span></td>
                    <td className="mono small">{t.reporterId}</td>
                    <td>{t.targetType}</td>
                    <td><Badge tone={t.priority === 'urgent' || t.priority === 'high' ? 'danger' : t.priority === 'normal' ? 'warn' : 'default'}>{t.priority}</Badge></td>
                    <td><StatusBadge status={t.status} /></td>
                    <td>{t.assignedTo ?? <span className="faint">—</span>}</td>
                    <td>{fmtDate(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {data && data.items.length === 0 && <EmptyState icon="🎧" title="No tickets" hint="No support tickets match these filters." />}
            {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
          </>
        )}
      </div>

      {selectedId && (
        <Drawer title="Support ticket" onClose={() => setSelectedId(null)}>
          {detail.loading && !ticket ? <TableSkeleton rows={4} cols={2} /> : detail.error
            ? <ErrorState error={detail.error} onRetry={detail.reload} />
            : ticket && (
              <div>
                <div className="row wrap"><StatusBadge status={ticket.status} /><Badge>{ticket.priority}</Badge></div>
                <h3 style={{ marginTop: 12 }}>{ticket.reason}</h3>
                <p style={{ whiteSpace: 'pre-wrap' }}>{ticket.description || 'No description provided.'}</p>
                <dl className="kv">
                  <dt>User</dt><dd><Link to={`/users/${ticket.reporterId}`}>{ticket.reporterId}</Link></dd>
                  <dt>Category</dt><dd>{ticket.targetType}</dd>
                  <dt>Filed</dt><dd>{fmtDate(ticket.createdAt)}</dd>
                  <dt>Updated</dt><dd>{fmtDate(ticket.updatedAt)}</dd>
                  <dt>Resolution</dt><dd>{ticket.resolution || '—'}</dd>
                </dl>
                {ticket.screenshotUrls.length > 0 && (
                  <>
                    <h3 style={{ marginTop: 14 }}>Attachments</h3>
                    <div className="row wrap">
                      {ticket.screenshotUrls.map((u, i) => (
                        <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt={`Attachment ${i + 1}`} className="thumb-sm" style={{ width: 92, height: 92 }} /></a>
                      ))}
                    </div>
                  </>
                )}
                <div className="row wrap" style={{ marginTop: 14 }}>
                  <div className="field" style={{ flex: 1, minWidth: 140, margin: 0 }}>
                    <label htmlFor="tk-status">Status</label>
                    <select id="tk-status" className="select" defaultValue={ticket.status} disabled={busy}
                      onChange={(e) => patch({ status: e.target.value }, 'Ticket status updated.')}>
                      {TICKET_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ flex: 1, minWidth: 140, margin: 0 }}>
                    <label htmlFor="tk-prio">Priority</label>
                    <select id="tk-prio" className="select" defaultValue={ticket.priority} disabled={busy}
                      onChange={(e) => patch({ priority: e.target.value }, 'Priority updated.')}>
                      {['low', 'normal', 'high', 'urgent'].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div className="field" style={{ marginTop: 12 }}>
                  <label htmlFor="tk-assign">Assigned to (staff ID)</label>
                  <input id="tk-assign" className="input" defaultValue={ticket.assignedTo ?? ''} placeholder="staff user id"
                    onBlur={(e) => { if (e.target.value !== (ticket.assignedTo ?? '')) patch({ assignedTo: e.target.value || null }, 'Assignment updated.'); }} />
                </div>
                <hr className="divider" />
                <PermissionGate permission="support.reply" fallback={<p className="small faint">You don’t have the support.reply permission.</p>}>
                  <h3>Reply to user</h3>
                  <div className="field">
                    <textarea className="textarea" value={reply} onChange={(e) => setReply(e.target.value)}
                      placeholder="Write a helpful, complete reply…" aria-label="Reply message" />
                  </div>
                  <div className="row wrap">
                    <label className="small muted" htmlFor="tk-via">Deliver via</label>
                    <select id="tk-via" className="select" style={{ width: 170 }} value={via} onChange={(e) => setVia(e.target.value as typeof via)}>
                      <option value="inapp">In-app notification</option>
                      <option value="email">Email</option>
                      <option value="both">Both</option>
                    </select>
                    <span className="spacer" />
                    <Button variant="primary" onClick={sendReply} disabled={busy || !reply.trim()}>{busy ? 'Sending…' : 'Send reply'}</Button>
                  </div>
                </PermissionGate>
              </div>
            )}
        </Drawer>
      )}
    </div>
  );
}
