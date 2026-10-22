import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, type AdminRole, type Permission } from '@atheleos/shared';
import type { Store } from '../db/store.js';

export async function getRolesConfig(store: Store): Promise<Record<string, Permission[]>> {
  try {
    const doc = await store.getDoc('admin_config/roles');
    if (!doc) return {};
    const out: Record<string, Permission[]> = {};
    for (const [k, v] of Object.entries(doc.data)) {
      if (Array.isArray(v)) out[k] = v.filter((p): p is Permission => (PERMISSIONS as readonly string[]).includes(p as string));
    }
    return out;
  } catch { return {}; }
}

export async function effectivePermissions(store: Store, role: AdminRole): Promise<Permission[]> {
  if (role === 'super_admin') {
    // Super admin always has all permissions regardless of overrides (safety).
    return [...PERMISSIONS];
  }
  const overrides = await getRolesConfig(store);
  if (overrides[role]) return overrides[role];
  return [...(DEFAULT_ROLE_PERMISSIONS[role] ?? [])];
}

export async function mergedRoleMatrix(store: Store): Promise<Record<AdminRole, Permission[]>> {
  const overrides = await getRolesConfig(store);
  const out = {} as Record<AdminRole, Permission[]>;
  for (const role of Object.keys(DEFAULT_ROLE_PERMISSIONS) as AdminRole[]) {
    out[role] = role === 'super_admin' ? [...PERMISSIONS] : (overrides[role] ?? [...DEFAULT_ROLE_PERMISSIONS[role]]);
  }
  return out;
}
