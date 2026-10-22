import { useState } from 'react';
import type { MetricValue } from '@atheleos/shared';
import { api, qs } from '../lib/api';
import { useFetch } from '../hooks/useFetch';
import type { AnalyticsResponse, LabeledCount } from '../lib/types';
import { Card, ErrorState, Skeleton, StatCard } from '../components/ui';
import { BarChart } from '../components/charts';
import { RangeFilter, rangeQuery, type RangeValue } from '../components/RangeFilter';

function ChartCard({ title, data, color }: { title: string; data: LabeledCount[] | undefined; color: string }) {
  return (
    <Card>
      <h2>{title}</h2>
      {data && data.length > 0
        ? <BarChart data={data.map((d) => ({ label: d.label, count: d.count }))} color={color} label={title} />
        : <p className="muted small">Not available — no source data for this breakdown in the selected range.</p>}
    </Card>
  );
}

function metricOrUndefined(m: MetricValue | undefined): MetricValue | undefined {
  return m;
}

export default function Analytics() {
  const [range, setRange] = useState<RangeValue>({ range: '30d' });
  const { data, loading, error, reload } = useFetch(
    () => api.get<AnalyticsResponse>(`/analytics${qs(rangeQuery(range))}`),
    [range.range, range.from, range.to],
  );

  const restrictions = Array.isArray(data?.restrictions) ? data.restrictions : undefined;
  const restrictionTotal = !Array.isArray(data?.restrictions) && data?.restrictions ? data.restrictions : undefined;

  return (
    <div className="page">
      <div className="page-head row between wrap">
        <div>
          <h1>Analytics & Insights</h1>
          <p className="muted" style={{ margin: 0 }}>Computed from live Atheleos data. A metric shown as “Not available” has no underlying source data — it is never faked as zero.</p>
        </div>
        <RangeFilter value={range} onChange={setRange} />
      </div>

      {error && !data ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? (
        <div className="grid cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={150} />)}</div>
      ) : data && (
        <>
          <div className="grid cols-4">
            <StatCard label="Registrations in range" metric={metricOrUndefined(data.registrations?.total)} />
            <StatCard label="Reports resolved" metric={metricOrUndefined(data.reports?.resolved)} />
            <StatCard label="Avg. report resolution (hrs)" metric={metricOrUndefined(data.reports?.avgResolutionHours)} />
            <StatCard label="Avg. support first response (hrs)" metric={metricOrUndefined(data.support?.avgFirstResponseHours ?? data.support?.avgResponseHours)} />
          </div>

          <div className="grid cols-2" style={{ marginTop: 16 }}>
            <ChartCard title="Registrations by role" data={data.registrations?.byRole} color="#d62976" />
            <ChartCard title="Registrations by sport" data={data.registrations?.bySport} color="#962fbf" />
          </div>
          <div className="grid cols-2" style={{ marginTop: 16 }}>
            <ChartCard title="Registrations by city" data={data.registrations?.byCity} color="#4f5bd5" />
            <ChartCard title="Content published by type" data={data.contentByType} color="#fa7e1e" />
          </div>
          <div className="grid cols-2" style={{ marginTop: 16 }}>
            <ChartCard title="Reports by status" data={data.reports?.byStatus} color="#f5a623" />
            {restrictions
              ? <ChartCard title="Account restrictions by type" data={restrictions} color="#ed4956" />
              : (
                <Card>
                  <h2>Account restrictions</h2>
                  {restrictionTotal
                    ? <StatCard label="Restrictions in range" metric={restrictionTotal} />
                    : <p className="muted small">Not available — no restriction data for this range.</p>}
                </Card>
              )}
          </div>
          <div className="grid cols-2" style={{ marginTop: 16 }}>
            <ChartCard title="Email delivery outcomes" data={data.emailOutcomes} color="#2ecc71" />
            <Card>
              <h2>Support response times</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <StatCard label="Avg. first response (hrs)" metric={metricOrUndefined(data.support?.avgFirstResponseHours)} />
                <StatCard label="Open tickets" metric={metricOrUndefined(data.support?.open)} />
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
