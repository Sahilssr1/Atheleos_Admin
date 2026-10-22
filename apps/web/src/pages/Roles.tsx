import { useEffect, useState } from 'react';
import {
  ADMIN_ROLES, DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLE_LABELS,
  type AdminRole, type Permission,
} from '@atheleos/shared';
import { api, ApiError } from '../lib/api';
import { useFetch } from '../hooks/useFetch';
import { Button, Card, ErrorState, Skeleton } from '../components/ui';
import { useToast } from '../components/Toast';

type Matrix = Partial<Record<AdminRole, Permission[]>>;

/** Permission matrix editor. Super Admin is locked to all permissions by design. */
export default function Roles() {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(
    () => api.get<Record<string, Permission[]> | { roles?: Record<string, Permission[]> }>('/roles'),
    [],
  );
  const [matrix, setMatrix] = useState<Matrix>({});
  const [dirty, setDirty] = useState<Set<AdminRole>>(new Set());
  const [saving, setSaving] = useState<AdminRole | null>(null);

  useEffect(() => {
    if (!data) return;
    const fromApi = ((data as { roles?: Record<string, Permission[]> }).roles ?? data) as Record<string, Permission[]>;
    const merged: Matrix = {};
    for (const role of ADMIN_ROLES) {
      merged[role] = (fromApi[role] as Permission[] | undefined) ?? DEFAULT_ROLE_PERMISSIONS[role];
    }
    setMatrix(merged);
    setDirty(new Set());
  }, [data]);

  const toggle = (role: AdminRole, perm: Permission) => {
    if (role === 'super_admin') return;
    setMatrix((m) => {
      const current = m[role] ?? [];
      const next = current.includes(perm) ? current.filter((p) => p !== perm) : [...current, perm];
      return { ...m, [role]: next };
    });
    setDirty((d) => new Set(d).add(role));
  };

  const save = async (role: AdminRole) => {
    setSaving(role);
    try {
      await api.put(`/roles/${role}`, { permissions: matrix[role] ?? [] });
      toast.push(`${ROLE_LABELS[role]} permissions saved.`, 'success');
      setDirty((d) => { const n = new Set(d); n.delete(role); return n; });
      reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Save failed.', 'error');
    } finally { setSaving(null); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Roles & Permissions</h1>
        <p className="muted" style={{ margin: 0 }}>
          Granular permission matrix per staff role. Authorization is enforced on the API for every endpoint —
          hiding a screen is never the only control. <strong>Super Admin always holds every permission and cannot be edited.</strong>
        </p>
      </div>

      {loading && !data ? <Skeleton height={400} /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
        <Card flush>
          <div className="perm-matrix table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Permission</th>
                  {ADMIN_ROLES.map((r) => (
                    <th key={r}>
                      {ROLE_LABELS[r]}
                      {r !== 'super_admin' && (
                        <div style={{ marginTop: 6 }}>
                          <Button size="sm" variant={dirty.has(r) ? 'primary' : 'default'} disabled={!dirty.has(r) || saving === r}
                            onClick={() => save(r)}>
                            {saving === r ? 'Saving…' : 'Save'}
                          </Button>
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSIONS.map((perm) => (
                  <tr key={perm}>
                    <td className="mono">{perm}</td>
                    {ADMIN_ROLES.map((role) => {
                      const checked = role === 'super_admin' ? true : (matrix[role] ?? []).includes(perm);
                      return (
                        <td key={role}>
                          <input type="checkbox" checked={checked} disabled={role === 'super_admin'}
                            aria-label={`${ROLE_LABELS[role]} — ${perm}`}
                            onChange={() => toggle(role, perm)} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <p className="small faint" style={{ marginTop: 12 }}>
        Changes take effect for new API requests immediately and are written to the audit log. Defaults shown for roles the API has not overridden come from @atheleos/shared.
      </p>
    </div>
  );
}
