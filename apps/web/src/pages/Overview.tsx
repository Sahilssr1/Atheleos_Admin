import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardOverview } from '@atheleos/shared';
import { api, qs } from '../lib/api';
import { useFetch } from '../hooks/useFetch';
import { fmtDate, timeAgo } from '../lib/format';
import { Badge, Card, CardSkeleton, ErrorState, StatCard } from '../components/ui';
import { LineChart } from '../components/charts';
import { RangeFilter, rangeQuery, type RangeValue } from '../components/RangeFilter';

function HealthChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className="row" style={{ gap: 7 }}>
      <span className="health-dot" style={{ background: ok ? 'var(--ok)' : 'var(--danger)' }} aria-hidden />
      <span className="small">{label}: <strong>{ok ? 'Connected' : 'Unavailable'}</strong></span>
    </span>
  );
}

export default function Overview() {
  const [range, setRange] = useState<RangeValue>({ range: '30d' });
  const { data, loading, error, reload } = useFetch(
    () => api.get<DashboardOverview>(`/dashboard/overview${qs(rangeQuery(range))}`),
    [range.range, range.from, range.to],
  );

  return (
    <div className="page">
      <div className="page-head row between wrap">
        <div>
          <h1>Overview</h1>
          <p className="muted" style={{ margin: 0 }}>Platform totals and activity from live Atheleos data.</p>
        </div>
        <RangeFilter value={range} onChange={setRange} />
      </div>

      {error && !data ? <ErrorState error={error} onRetry={reload} /> : null}

      {loading && !data && (
        <div className="grid cols-4">{Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      )}

      {data && (
        <>
          <div className="grid cols-4">
            <StatCard label="Total users" metric={data.totals.users} />
            <StatCard label="New registrations" metric={data.totals.newUsers} />
            <StatCard label="Active users" metric={data.totals.activeUsers} />
            <StatCard label="Suspended users" metric={data.totals.suspendedUsers} />
            <StatCard label="Posts" metric={data.totals.posts} />
            <StatCard label="Clips / Reels" metric={data.totals.clips} />
            <StatCard label="Stories" metric={data.totals.stories} />
            <StatCard label="Comments" metric={data.totals.comments} />
            <StatCard label="Open reports" metric={data.totals.reportsOpen} />
            <StatCard label="Pending moderation" metric={data.totals.moderationPending} />
            <StatCard label="Open support tickets" metric={data.totals.supportOpen} />
            <StatCard label="Notifications sent" metric={data.totals.notificationsSent} />
          </div>

          <div className="grid cols-3" style={{ marginTop: 16 }}>
            <StatCard label="Emails queued" metric={data.totals.emailsQueued} />
            <StatCard label="Emails delivered" metric={data.totals.emailsDelivered} />
            <StatCard label="Emails failed" metric={data.totals.emailsFailed} />
          </div>

          <div className="grid cols-3" style={{ marginTop: 16 }}>
            <Card>
              <h2>Registrations</h2>
              <LineChart data={data.series?.registrations ?? []} color="#d62976" label="Registration trend" />
            </Card>
            <Card>
              <h2>Content published</h2>
              <LineChart data={data.series?.content ?? []} color="#962fbf" label="Content publication trend" />
            </Card>
            <Card>
              <h2>Reports filed</h2>
              <LineChart data={data.series?.reports ?? []} color="#fa7e1e" label="Report volume trend" />
            </Card>
          </div>

          <div className="grid cols-2" style={{ marginTop: 16 }}>
            <Card flush>
              <div style={{ padding: '14px 16px 6px' }}><h2>Recent administrative actions</h2></div>
              {(!data.recentActions || data.recentActions.length === 0)
                ? <p className="muted small" style={{ padding: '0 16px 16px' }}>No administrative actions recorded yet.</p>
                : (
                  <div className="table-wrap">
                    <table className="table">
                      <tbody>
                        {data.recentActions.slice(0, 8).map((a) => (
                          <tr key={a.id}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{a.action}</div>
                              <div className="small faint">{a.adminEmail} · {a.resourceType}{a.resourceId ? `/${a.resourceId}` : ''}</div>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Badge tone={a.outcome === 'success' ? 'ok' : 'danger'}>{a.outcome}</Badge>
                              <div className="small faint">{timeAgo(a.createdAt)}</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              <div style={{ padding: '10px 16px 14px' }}><Link to="/audit">View full audit log →</Link></div>
            </Card>

            <Card>
              <h2>System & integration status</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <HealthChip label="Firestore / app data" ok={data.health.firestore} />
                <HealthChip label="Email delivery" ok={data.health.email} />
                <HealthChip label="Messaging" ok={data.health.messaging} />
              </div>
              <hr className="divider" />
              <p className="small muted" style={{ margin: 0 }}>
                Detailed service checks, latency and configuration states are on the{' '}
                <Link to="/health">System Health</Link> page. Metrics shown as “Not available” mean the
                underlying source data does not exist — they are never displayed as zero.
              </p>
              <p className="small faint">Range: {data.range} · Generated {fmtDate(new Date().toISOString())}</p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
