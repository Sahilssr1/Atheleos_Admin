import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Paginated, VerificationApplication } from '@atheleos/shared';
import { api, ApiError, qs } from '../lib/api';
import { useFetch } from '../hooks/useFetch';
import { fmtDate } from '../lib/format';
import { Avatar, Button, EmptyState, ErrorState, Pagination, StatusBadge, TableSkeleton } from '../components/ui';
import { Dialog } from '../components/Dialog';
import { useToast } from '../components/Toast';

const PAGE_SIZE = 25;
type Decision = 'approved' | 'rejected' | 'moreInfoRequired' | 'underReview';

export default function Verifications() {
  const toast = useToast();
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<VerificationApplication | null>(null);
  const [decision, setDecision] = useState<Decision>('approved');
  const [reason, setReason] = useState('');
  const [badge, setBadge] = useState('');
  const [level, setLevel] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useFetch(
    () => api.get<Paginated<VerificationApplication>>(`/verifications${qs({ status, page, pageSize: PAGE_SIZE })}`),
    [status, page],
  );

  const decide = async () => {
    if (!selected) return;
    if (!reason.trim()) { toast.push('A reason is required for every verification decision.', 'error'); return; }
    setBusy(true);
    try {
      await api.post(`/verifications/${selected.userId}/${selected.id}/decide`, {
        decision, reason: reason.trim(),
        badge: decision === 'approved' && badge ? badge : undefined,
        level: decision === 'approved' && level ? level : undefined,
      });
      toast.push(`Application ${decision === 'approved' ? 'approved' : decision}.`, 'success');
      setSelected(null); setReason(''); setBadge(''); setLevel('');
      reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Decision failed.', 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Verification queue</h1>
        <p className="muted" style={{ margin: 0 }}>Identity / credential applications submitted in the app. Decisions update the user’s protected verification fields and notify them.</p>
      </div>
      <div className="filters">
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="v-status">Status</label>
          <select id="v-status" className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="underReview">Under review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="moreInfoRequired">More info required</option>
          </select>
        </div>
      </div>

      <div className="card flush">
        {loading && !data ? <TableSkeleton cols={5} /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Applicant</th><th>Role</th><th>Status</th><th>Submitted</th><th>Updated</th><th /></tr></thead>
              <tbody>
                {data?.items.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <span className="row">
                        <Avatar name={v.displayName || v.username} />
                        <span>
                          <span style={{ fontWeight: 600 }}>{v.displayName || '—'}</span>
                          <span className="small faint" style={{ display: 'block' }}>@{v.username} · <Link to={`/users/${v.userId}`}>{v.userId}</Link></span>
                        </span>
                      </span>
                    </td>
                    <td>{v.role || '—'}</td>
                    <td><StatusBadge status={v.status} /></td>
                    <td>{fmtDate(v.submittedAt)}</td>
                    <td>{fmtDate(v.updatedAt)}</td>
                    <td><Button size="sm" onClick={() => { setSelected(v); setDecision('approved'); }}>Review</Button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {data && data.items.length === 0 && <EmptyState icon="✅" title="No applications" hint="No verification applications with this status." />}
            {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
          </>
        )}
      </div>

      {selected && (
        <Dialog title={`Verification — ${selected.displayName || selected.username}`} onClose={() => setSelected(null)} wide>
          <dl className="kv">
            <dt>Applicant</dt><dd>{selected.displayName} (@{selected.username})</dd>
            <dt>User ID</dt><dd className="mono">{selected.userId}</dd>
            <dt>Role</dt><dd>{selected.role || '—'}</dd>
            <dt>Status</dt><dd><StatusBadge status={selected.status} /></dd>
            <dt>Submitted</dt><dd>{fmtDate(selected.submittedAt)}</dd>
          </dl>
          <h3 style={{ marginTop: 16 }}>Application details</h3>
          {Object.keys(selected.details ?? {}).length === 0
            ? <p className="muted small">No additional details were submitted.</p>
            : <pre className="json">{JSON.stringify(selected.details, null, 2)}</pre>}
          <hr className="divider" />
          <div className="field">
            <label htmlFor="vd">Decision</label>
            <select id="vd" className="select" value={decision} onChange={(e) => setDecision(e.target.value as Decision)}>
              <option value="approved">Approve</option>
              <option value="rejected">Reject</option>
              <option value="moreInfoRequired">Request more information</option>
              <option value="underReview">Mark under review</option>
            </select>
          </div>
          {decision === 'approved' && (
            <div className="row wrap">
              <div className="field" style={{ flex: 1, minWidth: 160 }}>
                <label htmlFor="vbadge">Badge (optional)</label>
                <input id="vbadge" className="input" value={badge} onChange={(e) => setBadge(e.target.value)} placeholder="e.g. Verified Athlete" />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 160 }}>
                <label htmlFor="vlevel">Level (optional)</label>
                <input id="vlevel" className="input" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="e.g. National" />
              </div>
            </div>
          )}
          <div className="field">
            <label htmlFor="vreason">Reason / note for the applicant *</label>
            <textarea id="vreason" className="textarea" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="This is recorded and shared with the applicant where appropriate." />
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setSelected(null)} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={decide} disabled={busy || !reason.trim()}>{busy ? 'Saving…' : 'Submit decision'}</Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
