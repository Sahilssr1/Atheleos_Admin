import { api } from '../lib/api';
import { useFetch } from '../hooks/useFetch';
import type { HealthCheck, HealthResponse } from '../lib/types';
import { Badge, Button, Card, ErrorState, Skeleton } from '../components/ui';

function normalize(data: HealthResponse | null): { checks: HealthCheck[]; dataMode?: string } {
  if (!data) return { checks: [] };
  const raw = data.checks ?? data.services;
  if (Array.isArray(raw)) return { checks: raw, dataMode: data.dataMode ?? data.mode };
  // Tolerate an object map: { firestore: {status, latencyMs}, ... }
  const checks: HealthCheck[] = [];
  for (const [name, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'status' in (value as Record<string, unknown>)) {
      const v = value as { status: string; latencyMs?: number; message?: string; label?: string };
      checks.push({ name, label: v.label, status: v.status, latencyMs: v.latencyMs, message: v.message });
    }
  }
  return { checks, dataMode: data.dataMode ?? data.mode };
}

function tone(status: string): 'ok' | 'danger' | 'warn' {
  if (status === 'ok' || status === 'up' || status === 'healthy') return 'ok';
  if (status === 'not_configured') return 'warn';
  return 'danger';
}
function label(status: string): string {
  if (status === 'not_configured') return 'Not configured';
  if (status === 'ok' || status === 'up' || status === 'healthy') return 'Operational';
  return status;
}

const ICONS: Record<string, string> = {
  firestore: '🔥', database: '🗄️', smtp: '📤', email: '✉️', imap: '📥',
  worker: '⚙️', media: '🎞️', functions: '⚡', messaging: '💬', storage: '💾',
};

export default function Health() {
  const { data, loading, error, reload } = useFetch(() => api.get<HealthResponse>('/system/health'), []);
  const { checks, dataMode } = normalize(data);

  return (
    <div className="page">
      <div className="page-head row between wrap">
        <div>
          <h1>System Health</h1>
          <p className="muted" style={{ margin: 0 }}>Live checks performed by the admin API against its integrations. Sensitive infrastructure details are not exposed.</p>
        </div>
        <Button onClick={reload} disabled={loading}>{loading ? 'Checking…' : '↻ Re-check'}</Button>
      </div>

      {dataMode === 'memory' && (
        <div className="config-box" style={{ marginBottom: 16 }} role="alert">
          <strong>Data mode: in-memory.</strong> The API is running without Firestore
          (<span className="mono">FIREBASE_NOT_CONFIGURED</span> fallback), so data shown across the panel is
          process-local and will not persist across restarts. Configure Firebase Admin credentials on the API
          server for production data.
        </div>
      )}
      {dataMode && dataMode !== 'memory' && (
        <p className="small muted">Data mode: <strong>{dataMode}</strong></p>
      )}

      {error && !data ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? (
        <div className="grid cols-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={110} />)}</div>
      ) : (
        <div className="grid cols-3">
          {checks.map((c) => (
            <Card key={c.name}>
              <div className="row between">
                <span style={{ fontSize: 22 }} aria-hidden>{ICONS[c.name.toLowerCase()] ?? '🧩'}</span>
                <Badge tone={tone(c.status)}>{label(c.status)}</Badge>
              </div>
              <h2 style={{ marginTop: 10 }}>{c.label ?? c.name}</h2>
              <p className="small muted" style={{ margin: 0 }}>
                {c.status === 'not_configured'
                  ? 'Not configured on the API server — set the matching environment variables to enable it.'
                  : c.message ?? (tone(c.status) === 'ok' ? 'Responding normally.' : 'The check failed — see API logs for detail.')}
              </p>
              {c.latencyMs !== undefined && c.latencyMs !== null && (
                <p className="small faint" style={{ marginBottom: 0 }}>Latency: {Math.round(c.latencyMs)} ms</p>
              )}
            </Card>
          ))}
          {checks.length === 0 && (
            <Card><h2>No checks returned</h2><p className="muted small">The health endpoint responded without service checks.</p></Card>
          )}
        </div>
      )}
    </div>
  );
}
