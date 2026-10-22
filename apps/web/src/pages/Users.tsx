import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppUser, Paginated } from '@atheleos/shared';
import { api, qs } from '../lib/api';
import { useFetch, useDebounced } from '../hooks/useFetch';
import { fmtDateOnly } from '../lib/format';
import { Avatar, Badge, EmptyState, ErrorState, Pagination, SearchInput, StatusBadge, TableSkeleton } from '../components/ui';

const PAGE_SIZE = 25;
type SortKey = 'createdAt' | 'displayName' | 'username' | 'followersCount' | 'reportCount';

export default function Users() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q);
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [verified, setVerified] = useState('');
  const [sort, setSort] = useState<SortKey>('createdAt');
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useFetch(
    () => api.get<Paginated<AppUser>>(`/users${qs({ q: debouncedQ, status, role, verified, sort, page, pageSize: PAGE_SIZE })}`),
    [debouncedQ, status, role, verified, sort, page],
  );

  const sortHeader = (label: string, key: SortKey) => (
    <th className="sortable" onClick={() => { setSort(key); setPage(1); }} aria-sort={sort === key ? 'descending' : undefined}>
      {label}{sort === key ? ' ↓' : ''}
    </th>
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>Users</h1>
        <p className="muted" style={{ margin: 0 }}>Every registered Atheleos account. Contact details are only shown to admins with the contact permission.</p>
      </div>

      <div className="filters">
        <div className="grow"><SearchInput placeholder="Search name, username, email, ID…" value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search users" /></div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="f-status">Status</label>
          <select id="f-status" className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="restricted">Restricted</option>
            <option value="deleted">Deleted</option>
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="f-role">Role</label>
          <select id="f-role" className="select" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
            <option value="">All roles</option>
            <option value="Athlete">Athlete</option>
            <option value="Coach">Coach</option>
            <option value="Brand">Brand</option>
            <option value="Federation">Federation</option>
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="f-verified">Verified</label>
          <select id="f-verified" className="select" value={verified} onChange={(e) => { setVerified(e.target.value); setPage(1); }}>
            <option value="">Any</option>
            <option value="true">Verified</option>
            <option value="false">Not verified</option>
          </select>
        </div>
      </div>

      <div className="card flush">
        {loading && !data ? <TableSkeleton cols={6} /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    {sortHeader('User', 'displayName')}
                    <th>Contact</th>
                    <th>Role</th>
                    {sortHeader('Joined', 'createdAt')}
                    <th>Status</th>
                    {sortHeader('Reports', 'reportCount')}
                  </tr>
                </thead>
                <tbody>
                  {data?.items.map((u) => (
                    <tr key={u.id} className="clickable" onClick={() => navigate(`/users/${u.id}`)}>
                      <td>
                        <span className="row">
                          <Avatar src={u.avatarUrl} name={u.displayName || u.username} />
                          <span>
                            <span style={{ fontWeight: 600 }}>{u.displayName || '—'}</span>
                            {u.verified && <Badge tone="grad">✓ verified</Badge>}
                            <span className="small faint" style={{ display: 'block' }}>@{u.username} · {u.id}</span>
                          </span>
                        </span>
                      </td>
                      <td>{u.email ?? <span className="faint">Hidden (no contact permission)</span>}
                        {u.phone && <span className="small faint" style={{ display: 'block' }}>{u.phone}</span>}</td>
                      <td>{u.role || '—'}{u.sport ? <span className="small faint" style={{ display: 'block' }}>{u.sport}</span> : null}</td>
                      <td>{fmtDateOnly(u.createdAt)}</td>
                      <td><StatusBadge status={u.accountStatus} /></td>
                      <td>{u.reportCount > 0 ? <Badge tone={u.reportCount >= 3 ? 'danger' : 'warn'}>{u.reportCount}</Badge> : '0'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data && data.items.length === 0 && <EmptyState icon="👥" title="No users match" hint="Try a different search or filter combination." />}
            {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
          </>
        )}
      </div>
    </div>
  );
}
