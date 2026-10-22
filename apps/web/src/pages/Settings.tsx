import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useFetch } from '../hooks/useFetch';
import type { SettingsResponse } from '../lib/types';
import { PermissionGate } from '../auth/AuthContext';
import { Badge, Button, Card, ErrorState, Skeleton } from '../components/ui';
import { useToast } from '../components/Toast';

export default function Settings() {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(() => api.get<SettingsResponse>('/settings'), []);
  const [appName, setAppName] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [retentionDays, setRetentionDays] = useState('');
  const [moderation, setModeration] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const p = data?.platform ?? (data as Record<string, unknown> | null) ?? {};
    setAppName(String((p as Record<string, unknown>).appName ?? ''));
    setSupportEmail(String((p as Record<string, unknown>).supportEmail ?? ''));
    setRetentionDays(String((p as Record<string, unknown>).retentionDays ?? ''));
    setModeration(((p as Record<string, unknown>).moderation as Record<string, unknown>) ?? {});
  }, [data]);

  const platform = data?.platform ?? {};
  const integrations = data?.integrations ?? [];

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/settings', {
        appName: appName || undefined,
        supportEmail: supportEmail || undefined,
        retentionDays: retentionDays === '' ? undefined : Number(retentionDays),
        moderation,
      });
      toast.push('Platform settings saved.', 'success');
      reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Save failed.', 'error');
    } finally { setSaving(false); }
  };

  const modBool = (key: string, label: string) => (
    <label className="checkbox-row" key={key}>
      <input type="checkbox" checked={Boolean(moderation[key])}
        onChange={(e) => setModeration((m) => ({ ...m, [key]: e.target.checked }))} />
      {label}
    </label>
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>Platform Settings</h1>
        <p className="muted" style={{ margin: 0 }}>Application configuration stored in <span className="mono">admin_config/platform</span>. Secrets are never returned to the browser — integrations show configuration status only.</p>
      </div>

      {loading && !data ? <Skeleton height={320} /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
        <div className="grid cols-2" style={{ alignItems: 'start' }}>
          <Card>
            <h2>Application</h2>
            <div className="field">
              <label htmlFor="set-name">Application name</label>
              <input id="set-name" className="input" value={appName} onChange={(e) => setAppName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="set-support">Support email</label>
              <input id="set-support" className="input" type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="set-retention">Content retention (days)</label>
              <input id="set-retention" className="input" type="number" min={0} value={retentionDays} onChange={(e) => setRetentionDays(e.target.value)} />
            </div>
            <dl className="kv">
              <dt>Admin session TTL</dt>
              <dd>{platform.sessionTtlMinutes ? `${platform.sessionTtlMinutes} minutes (set by API environment)` : 'Set by API environment (ADMIN_SESSION_TTL)'}</dd>
            </dl>
            <hr className="divider" />
            <h2>Moderation defaults</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {modBool('autoFlagRepeatOffenders', 'Flag repeat offenders for review')}
              {modBool('requireReasonForRemoval', 'Require a reason for every content removal')}
              {modBool('notifyUserOnAction', 'Notify users when action is taken on their content')}
              {modBool('appealsEnabled', 'Allow users to appeal moderation decisions')}
            </div>
            <PermissionGate permission="settings.manage" fallback={<p className="small faint">You can view settings but need settings.manage to change them.</p>}>
              <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Button>
            </PermissionGate>
          </Card>

          <Card>
            <h2>Integrations</h2>
            {integrations.length === 0
              ? <p className="muted small">The API did not return integration status.</p>
              : integrations.map((i) => (
                <div key={i.name} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span>
                    <span style={{ fontWeight: 600 }}>{i.label ?? i.name}</span>
                    {i.detail && <span className="small faint" style={{ display: 'block' }}>{i.detail}</span>}
                  </span>
                  <Badge tone={i.configured ? 'ok' : 'warn'}>{i.configured ? 'Configured' : 'Not configured'}</Badge>
                </div>
              ))}
            <p className="small faint" style={{ marginTop: 12 }}>
              Integration credentials live only in the API server’s environment / secret manager. Changing them requires a server-side update and restart — never paste secrets into this panel.
            </p>
            <hr className="divider" />
            <h2>Other stored settings</h2>
            {data && Object.keys(platform).filter((k) => !['appName', 'supportEmail', 'retentionDays', 'moderation', 'sessionTtlMinutes'].includes(k)).length === 0
              ? <p className="muted small">No additional settings stored.</p>
              : <pre className="json">{JSON.stringify(Object.fromEntries(Object.entries(platform).filter(([k]) => !['appName', 'supportEmail', 'retentionDays', 'moderation', 'sessionTtlMinutes'].includes(k))), null, 2)}</pre>}
          </Card>
        </div>
      )}
    </div>
  );
}
