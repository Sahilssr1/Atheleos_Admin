import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ModerationCase, Paginated } from '@atheleos/shared';
import { api, ApiError, qs } from '../lib/api';
import { useFetch } from '../hooks/useFetch';
import { fmtDate } from '../lib/format';
import { PermissionGate, useAuth } from '../auth/AuthContext';
import { Badge, Button, EmptyState, ErrorState, Pagination, StatusBadge, TableSkeleton } from '../components/ui';
import { Dialog, PromptDialog } from '../components/Dialog';
import { useToast } from '../components/Toast';

const PAGE_SIZE = 25;
const DECISIONS = ['action_taken', 'dismissed', 'closed'] as const;

export default function Moderation() {
  const [params] = useSearchParams();
  const toast = useToast();
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<ModerationCase | null>(null);
  const [busy, setBusy] = useState(false);
  // Create-case form (prefillable from Content via query params)
  const [showCreate, setShowCreate] = useState(Boolean(params.get('targetId')));
  const [createForm, setCreateForm] = useState({
    reportId: '', targetType: params.get('targetType') ?? 'post', targetId: params.get('targetId') ?? '',
    reason: '', priority: 'normal',
  });

  const { data, loading, error, reload } = useFetch(
    () => api.get<Paginated<ModerationCase>>(`/moderation/cases${qs({ status, priority, page, pageSize: PAGE_SIZE })}`),
    [status, priority, page],
  );
  const detail = useFetch(
    () => (detailId ? api.get<ModerationCase>(`/moderation/cases/${detailId}`) : Promise.resolve(null)),
    [detailId],
  );
  const caseDetail = detail.data;

  const patch = async (c: ModerationCase, body: Record<string, unknown>, msg: string) => {
    setBusy(true);
    try {
      await api.patch(`/moderation/cases/${c.id}`, body);
      toast.push(msg, 'success');
      reload(); detail.reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Update failed.', 'error');
    } finally { setBusy(false); }
  };

  const addNote = async (text: string) => {
    if (!noteFor) return;
    setBusy(true);
    try {
      await api.post(`/moderation/cases/${noteFor.id}/note`, { text });
      toast.push('Note added.', 'success');
      setNoteFor(null); detail.reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not add note.', 'error');
    } finally { setBusy(false); }
  };

  const decide = async (c: ModerationCase, decision: string, reason: string, contentAction: string, accountAction: string) => {
    setBusy(true);
    try {
      await api.post(`/moderation/cases/${c.id}/decide`, {
        decision, reason,
        contentAction: contentAction || undefined,
        accountAction: accountAction || undefined,
      });
      toast.push(`Case decided: ${decision.replace(/_/g, ' ')}.`, 'success');
      reload(); detail.reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Decision failed.', 'error');
    } finally { setBusy(false); }
  };

  const createCase = async () => {
    if (!createForm.targetId.trim() || !createForm.reason.trim()) {
      toast.push('Target ID and reason are required.', 'error'); return;
    }
    setBusy(true);
    try {
      await api.post('/moderation/cases', {
        reportId: createForm.reportId || undefined,
        targetType: createForm.targetType, targetId: createForm.targetId.trim(),
        reason: createForm.reason.trim(), priority: createForm.priority,
      });
      toast.push('Moderation case created.', 'success');
      setShowCreate(false); reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not create case.', 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="page">
      <div className="page-head row between wrap">
        <div>
          <h1>Moderation queue</h1>
          <p className="muted" style={{ margin: 0 }}>A report is never proof of a violation — review the evidence, then decide. Every decision is audit-logged.</p>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(true)}>+ New case</Button>
      </div>

      <div className="filters">
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="m-status">Status</label>
          <select id="m-status" className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {['new', 'under_review', 'escalated', 'action_taken', 'dismissed', 'appealed', 'closed'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="m-prio">Priority</label>
          <select id="m-prio" className="select" value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {['low', 'normal', 'high', 'urgent'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="card flush">
        {loading && !data ? <TableSkeleton cols={6} /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Case</th><th>Target</th><th>Reason</th><th>Priority</th><th>Status</th><th>Assigned</th><th>Created</th></tr></thead>
              <tbody>
                {data?.items.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => setDetailId(c.id)}>
                    <td className="mono">{c.id.slice(0, 10)}…</td>
                    <td>{c.targetType}/{c.targetId.slice(0, 14)}</td>
                    <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.reason}</td>
                    <td><Badge tone={c.priority === 'urgent' || c.priority === 'high' ? 'danger' : c.priority === 'normal' ? 'warn' : 'default'}>{c.priority}</Badge></td>
                    <td><StatusBadge status={c.status} /></td>
                    <td>{c.assignedTo ?? <span className="faint">Unassigned</span>}</td>
                    <td>{fmtDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {data && data.items.length === 0 && <EmptyState icon="🛡️" title="Queue is clear" hint="No moderation cases match these filters." />}
            {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
          </>
        )}
      </div>

      {showCreate && (
        <Dialog title="Create moderation case" onClose={() => setShowCreate(false)}>
          <div className="field"><label htmlFor="cc-report">Report ID (optional — links the case to a report)</label>
            <input id="cc-report" className="input mono" value={createForm.reportId} onChange={(e) => setCreateForm({ ...createForm, reportId: e.target.value })} /></div>
          <div className="row wrap">
            <div className="field" style={{ flex: 1, minWidth: 150 }}><label htmlFor="cc-type">Target type</label>
              <select id="cc-type" className="select" value={createForm.targetType} onChange={(e) => setCreateForm({ ...createForm, targetType: e.target.value })}>
                {['post', 'clip', 'story', 'comment', 'user', 'message', 'event'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div className="field" style={{ flex: 2, minWidth: 180 }}><label htmlFor="cc-target">Target ID *</label>
              <input id="cc-target" className="input mono" value={createForm.targetId} onChange={(e) => setCreateForm({ ...createForm, targetId: e.target.value })} /></div>
          </div>
          <div className="field"><label htmlFor="cc-reason">Reason *</label>
            <textarea id="cc-reason" className="textarea" value={createForm.reason} onChange={(e) => setCreateForm({ ...createForm, reason: e.target.value })} /></div>
          <div className="field"><label htmlFor="cc-prio">Priority</label>
            <select id="cc-prio" className="select" value={createForm.priority} onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value })}>
              {['low', 'normal', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select></div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" onClick={createCase} disabled={busy}>{busy ? 'Creating…' : 'Create case'}</Button>
          </div>
        </Dialog>
      )}

      {caseDetail && (
        <Dialog title={`Case ${caseDetail.id}`} onClose={() => setDetailId(null)} wide>
          <CaseDetail caseData={caseDetail} busy={busy}
            onAssign={() => patch(caseDetail, { assignedTo: user?.id }, 'Case assigned to you.')}
            onEscalate={() => patch(caseDetail, { status: 'escalated', priority: 'high' }, 'Case escalated.')}
            onStatus={(s) => patch(caseDetail, { status: s }, `Status set to ${s.replace(/_/g, ' ')}.`)}
            onNote={() => setNoteFor(caseDetail)}
            onDecide={decide} />
        </Dialog>
      )}
      {noteFor && (
        <PromptDialog title="Internal moderation note" label="Note (visible to staff only)" busy={busy}
          placeholder="What did you check? What evidence supports the decision?"
          onCancel={() => setNoteFor(null)} onSubmit={addNote} submitLabel="Add note" />
      )}
    </div>
  );
}

function CaseDetail({ caseData: c, busy, onAssign, onEscalate, onStatus, onNote, onDecide }: {
  caseData: ModerationCase; busy: boolean;
  onAssign: () => void; onEscalate: () => void; onStatus: (s: string) => void; onNote: () => void;
  onDecide: (c: ModerationCase, decision: string, reason: string, contentAction: string, accountAction: string) => void;
}) {
  const [decision, setDecision] = useState<string>('action_taken');
  const [reason, setReason] = useState('');
  const [contentAction, setContentAction] = useState('');
  const [accountAction, setAccountAction] = useState('');
  const isContent = ['post', 'clip', 'story', 'comment', 'event'].includes(c.targetType);
  return (
    <div>
      <div className="row wrap" style={{ marginBottom: 10 }}>
        <StatusBadge status={c.status} />
        <Badge tone={c.priority === 'urgent' || c.priority === 'high' ? 'danger' : 'warn'}>{c.priority} priority</Badge>
        {c.reportId && <span className="small">From report <Link to={`/reports?focus=${c.reportId}`}>{c.reportId}</Link></span>}
      </div>
      <dl className="kv">
        <dt>Target</dt><dd>{c.targetType} / <span className="mono">{c.targetId}</span></dd>
        <dt>Target author</dt><dd>{c.targetAuthorId ? <Link to={`/users/${c.targetAuthorId}`}>{c.targetAuthorId}</Link> : '—'}</dd>
        <dt>Reason</dt><dd>{c.reason}</dd>
        <dt>Assigned to</dt><dd>{c.assignedTo ?? 'Unassigned'}</dd>
        <dt>Created</dt><dd>{fmtDate(c.createdAt)}</dd>
        <dt>Updated</dt><dd>{fmtDate(c.updatedAt)}</dd>
        {c.decision && <><dt>Decision</dt><dd>{c.decision} — {c.decisionReason} (by {c.decidedBy})</dd></>}
      </dl>

      <h3 style={{ marginTop: 16 }}>Evidence</h3>
      {c.evidence.length === 0 ? <p className="muted small">No evidence attachments on this case.</p> : (
        <div className="row wrap">
          {c.evidence.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noreferrer">
              <img src={url} alt={`Evidence ${i + 1}`} className="thumb-sm" style={{ width: 84, height: 84 }} />
            </a>
          ))}
        </div>
      )}

      <h3 style={{ marginTop: 16 }}>Internal notes</h3>
      {c.notes.length === 0 ? <p className="muted small">No notes yet.</p> : c.notes.map((n, i) => (
        <div key={i} className="card" style={{ padding: '10px 12px', marginBottom: 8 }}>
          <div className="small faint">{n.by} · {fmtDate(n.at)}</div>
          <div>{n.text}</div>
        </div>
      ))}

      <div className="row wrap" style={{ marginTop: 12 }}>
        <Button size="sm" onClick={onAssign} disabled={busy}>Assign to me</Button>
        <Button size="sm" onClick={() => onStatus('under_review')} disabled={busy}>Mark under review</Button>
        <Button size="sm" onClick={onEscalate} disabled={busy}>Escalate</Button>
        <Button size="sm" variant="ghost" onClick={onNote} disabled={busy}>+ Internal note</Button>
      </div>

      <hr className="divider" />
      <PermissionGate permission="moderation.decide" fallback={<p className="small faint">You don’t have the moderation.decide permission, so you can review but not decide this case.</p>}>
        <h3>Decide this case</h3>
        <div className="row wrap">
          <div className="field" style={{ flex: 1, minWidth: 160, margin: 0 }}>
            <label htmlFor="dec">Decision</label>
            <select id="dec" className="select" value={decision} onChange={(e) => setDecision(e.target.value)}>
              {DECISIONS.map((d) => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          {isContent && (
            <div className="field" style={{ flex: 1, minWidth: 160, margin: 0 }}>
              <label htmlFor="ca">Content action</label>
              <select id="ca" className="select" value={contentAction} onChange={(e) => setContentAction(e.target.value)}>
                <option value="">None</option>
                <option value="hide">Hide content</option>
                <option value="remove">Remove content</option>
                <option value="restore">Restore content</option>
              </select>
            </div>
          )}
          <div className="field" style={{ flex: 1, minWidth: 160, margin: 0 }}>
            <label htmlFor="aa">Account action</label>
            <select id="aa" className="select" value={accountAction} onChange={(e) => setAccountAction(e.target.value)}>
              <option value="">None</option>
              <option value="warn">Warn user</option>
              <option value="restrict">Restrict account</option>
              <option value="suspend">Suspend account</option>
            </select>
          </div>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="dr">Decision reason *</label>
          <textarea id="dr" className="textarea" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="What policy applies and what did the evidence show?" />
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button variant="primary" disabled={busy || !reason.trim()}
            onClick={() => onDecide(c, decision, reason.trim(), contentAction, accountAction)}>
            {busy ? 'Saving…' : 'Record decision'}
          </Button>
        </div>
      </PermissionGate>
    </div>
  );
}
