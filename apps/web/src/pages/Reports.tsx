import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { Appeal, Paginated, ReportItem } from '@atheleos/shared';
import { api, ApiError, qs } from '../lib/api';
import { useFetch, useDebounced } from '../hooks/useFetch';
import { fmtDate } from '../lib/format';
import { PermissionGate } from '../auth/AuthContext';
import { Badge, Button, EmptyState, ErrorState, Pagination, SearchInput, StatusBadge, TableSkeleton } from '../components/ui';
import { ConfirmDialog, Dialog, Drawer, PromptDialog } from '../components/Dialog';
import { useToast } from '../components/Toast';

const PAGE_SIZE = 25;

export default function Reports() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'reports' | 'appeals'>(params.get('tab') === 'appeals' ? 'appeals' : 'reports');
  return (
    <div className="page">
      <div className="page-head">
        <h1>Reports & Appeals</h1>
        <p className="muted" style={{ margin: 0 }}>User, content, account, spam and abuse reports — plus appeals against moderation decisions.</p>
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'reports'} className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>Reports</button>
        <PermissionGate permission="appeals.view">
          <button role="tab" aria-selected={tab === 'appeals'} className={tab === 'appeals' ? 'active' : ''} onClick={() => setTab('appeals')}>Appeals</button>
        </PermissionGate>
      </div>
      {tab === 'reports' ? <ReportsTab /> : <AppealsTab />}
    </div>
  );
}

function ReportsTab() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('focus'));
  const [noteFor, setNoteFor] = useState<ReportItem | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useFetch(
    () => api.get<Paginated<ReportItem>>(`/reports${qs({ status, priority, q: debouncedQ, page, pageSize: PAGE_SIZE })}`),
    [status, priority, debouncedQ, page],
  );
  const detailState = useFetch(
    () => (selectedId ? api.get<ReportItem>(`/reports/${selectedId}`) : Promise.resolve(null)),
    [selectedId],
  );
  const report = detailState.data;

  const patch = async (body: Record<string, unknown>, msg: string) => {
    if (!report) return;
    setBusy(true);
    try {
      await api.patch(`/reports/${report.id}`, body);
      toast.push(msg, 'success');
      reload(); detailState.reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Update failed.', 'error');
    } finally { setBusy(false); }
  };

  const addNote = async (text: string) => {
    if (!noteFor) return;
    setBusy(true);
    try {
      await api.post(`/reports/${noteFor.id}/note`, { text });
      toast.push('Internal note added.', 'success');
      setNoteFor(null);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not add note.', 'error');
    } finally { setBusy(false); }
  };

  const createCase = async () => {
    if (!report) return;
    setBusy(true);
    try {
      await api.post('/moderation/cases', {
        reportId: report.id, targetType: report.targetType, targetId: report.targetId,
        reason: report.reason, priority: report.priority,
      });
      toast.push('Moderation case created from this report.', 'success');
      navigate('/moderation');
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not create case.', 'error');
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="filters">
        <div className="grow"><SearchInput placeholder="Search reports…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search reports" /></div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="r-status">Status</label>
          <select id="r-status" className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {['new', 'under_review', 'escalated', 'action_taken', 'dismissed', 'appealed', 'closed'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="r-prio">Priority</label>
          <select id="r-prio" className="select" value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {['low', 'normal', 'high', 'urgent'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="card flush">
        {loading && !data ? <TableSkeleton cols={6} /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Report</th><th>Target</th><th>Priority</th><th>Status</th><th>Assigned</th><th>Filed</th></tr></thead>
              <tbody>
                {data?.items.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => setSelectedId(r.id)}>
                    <td style={{ maxWidth: 320 }}><span style={{ fontWeight: 600 }}>{r.reason}</span>
                      <span className="small faint" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</span></td>
                    <td>{r.targetType}</td>
                    <td><Badge tone={r.priority === 'urgent' || r.priority === 'high' ? 'danger' : r.priority === 'normal' ? 'warn' : 'default'}>{r.priority}</Badge></td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>{r.assignedTo ?? <span className="faint">—</span>}</td>
                    <td>{fmtDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {data && data.items.length === 0 && <EmptyState icon="🚩" title="No reports" hint="No reports match these filters." />}
            {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
          </>
        )}
      </div>

      {selectedId && (
        <Drawer title="Report details" onClose={() => setSelectedId(null)}>
          {detailState.loading && !report ? <TableSkeleton rows={4} cols={2} /> : detailState.error
            ? <ErrorState error={detailState.error} onRetry={detailState.reload} />
            : report && (
              <div>
                <div className="row wrap"><StatusBadge status={report.status} /><Badge>{report.priority}</Badge></div>
                <dl className="kv" style={{ marginTop: 12 }}>
                  <dt>Reason</dt><dd>{report.reason}</dd>
                  <dt>Description</dt><dd>{report.description || '—'}</dd>
                  <dt>Reporter</dt><dd><Link to={`/users/${report.reporterId}`}>{report.reporterId}</Link> <span className="faint">(identity shown to authorized staff only)</span></dd>
                  <dt>Target</dt><dd>{report.targetType} / <span className="mono">{report.targetId}</span></dd>
                  <dt>Assigned to</dt><dd>{report.assignedTo ?? 'Unassigned'}</dd>
                  <dt>Filed</dt><dd>{fmtDate(report.createdAt)}</dd>
                  <dt>Updated</dt><dd>{fmtDate(report.updatedAt)}</dd>
                  <dt>Resolution</dt><dd>{report.resolution || '—'}</dd>
                </dl>
                {report.screenshotUrls.length > 0 && (
                  <>
                    <h3 style={{ marginTop: 14 }}>Screenshots</h3>
                    <div className="row wrap">
                      {report.screenshotUrls.map((u, i) => (
                        <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt={`Screenshot ${i + 1}`} className="thumb-sm" style={{ width: 92, height: 92 }} /></a>
                      ))}
                    </div>
                  </>
                )}
                <PermissionGate permission="reports.manage">
                  <hr className="divider" />
                  <div className="row wrap">
                    <div className="field" style={{ flex: 1, minWidth: 140, margin: 0 }}>
                      <label htmlFor="rp-status">Status</label>
                      <select id="rp-status" className="select" defaultValue={report.status} onChange={(e) => patch({ status: e.target.value }, 'Status updated.')}>
                        {['new', 'under_review', 'escalated', 'action_taken', 'dismissed', 'closed'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                      </select>
                    </div>
                    <div className="field" style={{ flex: 1, minWidth: 140, margin: 0 }}>
                      <label htmlFor="rp-prio">Priority</label>
                      <select id="rp-prio" className="select" defaultValue={report.priority} onChange={(e) => patch({ priority: e.target.value }, 'Priority updated.')}>
                        {['low', 'normal', 'high', 'urgent'].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="field" style={{ marginTop: 12 }}>
                    <label htmlFor="rp-assign">Assigned to (staff ID)</label>
                    <input id="rp-assign" className="input" defaultValue={report.assignedTo ?? ''} placeholder="staff user id"
                      onBlur={(e) => { if (e.target.value !== (report.assignedTo ?? '')) patch({ assignedTo: e.target.value || null }, 'Assignment updated.'); }} />
                  </div>
                  <div className="field">
                    <label htmlFor="rp-res">Resolution</label>
                    <textarea id="rp-res" className="textarea" defaultValue={report.resolution} placeholder="How was this resolved?"
                      onBlur={(e) => { if (e.target.value !== report.resolution) patch({ resolution: e.target.value }, 'Resolution saved.'); }} />
                  </div>
                  <div className="row wrap">
                    <Button size="sm" onClick={() => setNoteFor(report)} disabled={busy}>+ Internal note</Button>
                    <Button size="sm" variant="primary" onClick={createCase} disabled={busy}>Create moderation case</Button>
                  </div>
                </PermissionGate>
              </div>
            )}
        </Drawer>
      )}
      {noteFor && <PromptDialog title="Internal note" label="Note (staff only)" busy={busy} onCancel={() => setNoteFor(null)} onSubmit={addNote} submitLabel="Add note" />}
    </>
  );
}

function AppealsTab() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ userId: '', caseId: '', targetType: 'post', targetId: '', originalDecision: '', appealReason: '' });
  const [deciding, setDeciding] = useState<Appeal | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useFetch(
    () => api.get<Paginated<Appeal>>(`/appeals${qs({ status, page, pageSize: PAGE_SIZE })}`),
    [status, page],
  );

  const create = async () => {
    if (!form.userId.trim() || !form.targetId.trim() || !form.appealReason.trim()) {
      toast.push('User ID, target ID and appeal reason are required.', 'error'); return;
    }
    setBusy(true);
    try {
      await api.post('/appeals', { ...form, caseId: form.caseId || undefined });
      toast.push('Appeal created on behalf of the user.', 'success');
      setShowCreate(false); reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not create appeal.', 'error');
    } finally { setBusy(false); }
  };

  const decide = async (decision: 'approved' | 'rejected', note: string) => {
    if (!deciding) return;
    setBusy(true);
    try {
      await api.post(`/appeals/${deciding.id}/decide`, { decision, note });
      toast.push(decision === 'approved' ? 'Appeal approved — the original action has been reversed.' : 'Appeal rejected.', 'success');
      setDeciding(null); reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Decision failed.', 'error');
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="filters">
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="a-status">Status</label>
          <select id="a-status" className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <span className="spacer" />
        <Button variant="primary" onClick={() => setShowCreate(true)}>+ Create appeal on behalf</Button>
      </div>

      <div className="card flush">
        {loading && !data ? <TableSkeleton cols={5} /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>User</th><th>Target</th><th>Original decision</th><th>Appeal reason</th><th>Status</th><th>Submitted</th><th /></tr></thead>
              <tbody>
                {data?.items.map((a) => (
                  <tr key={a.id}>
                    <td><Link to={`/users/${a.userId}`}>{a.userId}</Link></td>
                    <td>{a.targetType}/{a.targetId.slice(0, 12)}</td>
                    <td>{a.originalDecision}</td>
                    <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.appealReason}</td>
                    <td><StatusBadge status={a.status} /></td>
                    <td>{fmtDate(a.createdAt)}</td>
                    <td>
                      {a.status === 'pending' && (
                        <PermissionGate permission="appeals.decide">
                          <Button size="sm" onClick={() => setDeciding(a)}>Decide</Button>
                        </PermissionGate>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {data && data.items.length === 0 && <EmptyState icon="⚖️" title="No appeals" hint="Appeals submitted by users (or created on their behalf) appear here." />}
            {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
          </>
        )}
      </div>

      {showCreate && (
        <Dialog title="Create appeal on behalf of a user" onClose={() => setShowCreate(false)}>
          <div className="field"><label htmlFor="ap-user">User ID *</label>
            <input id="ap-user" className="input mono" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} /></div>
          <div className="field"><label htmlFor="ap-case">Moderation case ID (optional)</label>
            <input id="ap-case" className="input mono" value={form.caseId} onChange={(e) => setForm({ ...form, caseId: e.target.value })} /></div>
          <div className="row wrap">
            <div className="field" style={{ flex: 1, minWidth: 140 }}><label htmlFor="ap-type">Target type</label>
              <select id="ap-type" className="select" value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value })}>
                {['post', 'clip', 'story', 'comment', 'user', 'event'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}><label htmlFor="ap-target">Target ID *</label>
              <input id="ap-target" className="input mono" value={form.targetId} onChange={(e) => setForm({ ...form, targetId: e.target.value })} /></div>
          </div>
          <div className="field"><label htmlFor="ap-orig">Original decision</label>
            <input id="ap-orig" className="input" value={form.originalDecision} onChange={(e) => setForm({ ...form, originalDecision: e.target.value })} placeholder="e.g. Content removed / Account suspended" /></div>
          <div className="field"><label htmlFor="ap-reason">Appeal reason *</label>
            <textarea id="ap-reason" className="textarea" value={form.appealReason} onChange={(e) => setForm({ ...form, appealReason: e.target.value })} /></div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create appeal'}</Button>
          </div>
        </Dialog>
      )}

      {deciding && (
        <AppealDecideDialog appeal={deciding} busy={busy} onCancel={() => setDeciding(null)} onDecide={decide} />
      )}
    </>
  );
}

function AppealDecideDialog({ appeal, busy, onCancel, onDecide }: {
  appeal: Appeal; busy: boolean; onCancel: () => void;
  onDecide: (decision: 'approved' | 'rejected', note: string) => void;
}) {
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [note, setNote] = useState('');
  return (
    <Dialog title="Decide appeal" onClose={onCancel}>
      <dl className="kv">
        <dt>User</dt><dd>{appeal.userId}</dd>
        <dt>Target</dt><dd>{appeal.targetType}/{appeal.targetId}</dd>
        <dt>Original decision</dt><dd>{appeal.originalDecision}</dd>
        <dt>Appeal reason</dt><dd>{appeal.appealReason}</dd>
      </dl>
      {decision === 'approved' && (
        <div className="config-box" style={{ margin: '14px 0' }}>
          <strong>Approving reverses the original action</strong> — removed content is restored or a suspended
          account is reinstated, and the user is notified of the outcome.
        </div>
      )}
      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="apd">Decision</label>
        <select id="apd" className="select" value={decision} onChange={(e) => setDecision(e.target.value as 'approved' | 'rejected')}>
          <option value="approved">Approve appeal (reverse the action)</option>
          <option value="rejected">Reject appeal (action stands)</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="apn">Reviewer note *</label>
        <textarea id="apn" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Recorded with the decision and shared with the user." />
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant={decision === 'approved' ? 'primary' : 'danger'} disabled={busy || !note.trim()}
          onClick={() => onDecide(decision, note.trim())}>
          {busy ? 'Saving…' : decision === 'approved' ? 'Approve & reverse' : 'Reject appeal'}
        </Button>
      </div>
    </Dialog>
  );
}
