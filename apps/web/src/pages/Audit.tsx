import { Fragment, useState } from 'react';
import type { AuditLogEntry, Paginated } from '@atheleos/shared';
import { api, qs } from '../lib/api';
import { useFetch, useDebounced } from '../hooks/useFetch';
import { fmtDate } from '../lib/format';
import { Badge, EmptyState, ErrorState, Pagination, SearchInput, TableSkeleton } from '../components/ui';

const PAGE_SIZE = 25;

export default function Audit() {
  const [action, setAction] = useState('');
  const debouncedAction = useDebounced(action);
  const [adminId, setAdminId] = useState('');
  const debouncedAdmin = useDebounced(adminId);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, loading, error, reload } = useFetch(
    () => api.get<Paginated<AuditLogEntry>>(`/audit-logs${qs({ action: debouncedAction, adminId: debouncedAdmin, page, pageSize: PAGE_SIZE })}`),
    [debouncedAction, debouncedAdmin, page],
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>Audit Logs</h1>
        <p className="muted" style={{ margin: 0 }}>Immutable record of administrative actions: logins, restrictions, moderation decisions, email/message actions, permission and configuration changes.</p>
      </div>
      <div className="filters">
        <div className="grow"><SearchInput placeholder="Filter by action (e.g. users.suspend)…" value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1); }} aria-label="Filter by action" /></div>
        <div style={{ flex: 1, minWidth: 200 }}><SearchInput placeholder="Filter by admin ID…" value={adminId}
          onChange={(e) => { setAdminId(e.target.value); setPage(1); }} aria-label="Filter by admin ID" /></div>
      </div>

      <div className="card flush">
        {loading && !data ? <TableSkeleton cols={5} /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Action</th><th>Administrator</th><th>Resource</th><th>Outcome</th><th>When</th><th /></tr></thead>
              <tbody>
                {data?.items.map((e) => (
                  <Fragment key={e.id}>
                    <tr className="clickable" onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                      <td className="mono">{e.action}</td>
                      <td>{e.adminEmail}<span className="small faint" style={{ display: 'block' }}>{e.adminId}</span></td>
                      <td>{e.resourceType}{e.resourceId ? `/${e.resourceId}` : ''}</td>
                      <td><Badge tone={e.outcome === 'success' ? 'ok' : 'danger'}>{e.outcome}</Badge></td>
                      <td>{fmtDate(e.createdAt)}</td>
                      <td>{expanded === e.id ? '▾' : '▸'}</td>
                    </tr>
                    {expanded === e.id && (
                      <tr>
                        <td colSpan={6} style={{ background: 'var(--bg-elev-2)' }}>
                          <dl className="kv">
                            <dt>Reason</dt><dd>{e.reason || '—'}</dd>
                            <dt>Resource</dt><dd>{e.resourceType} / <span className="mono">{e.resourceId || '—'}</span></dd>
                            <dt>Correlation ID</dt><dd className="mono">{e.correlationId || '—'}</dd>
                            <dt>Entry ID</dt><dd className="mono">{e.id}</dd>
                          </dl>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table></div>
            {data && data.items.length === 0 && <EmptyState icon="📜" title="No audit entries" hint="No entries match these filters." />}
            {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
          </>
        )}
      </div>
    </div>
  );
}
