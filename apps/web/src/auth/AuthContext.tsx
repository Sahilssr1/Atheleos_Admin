import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Permission, StaffUser } from '@atheleos/shared';
import { api, ApiError } from '../lib/api';

export interface LoginResult { user?: StaffUser; mfaRequired?: boolean; mfaToken?: string }

interface AuthState {
  user: StaffUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyMfa: (mfaToken: string, code: string) => Promise<StaffUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  hasPermission: (p: Permission) => boolean;
}

const AuthCtx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<StaffUser>('/auth/me');
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const res = await api.post<StaffUser & { mfaRequired?: boolean; mfaToken?: string }>('/auth/login', { email, password });
    if (res.mfaRequired) return { mfaRequired: true, mfaToken: res.mfaToken };
    setUser(res);
    return { user: res };
  }, []);

  const verifyMfa = useCallback(async (mfaToken: string, code: string): Promise<StaffUser> => {
    const me = await api.post<StaffUser>('/auth/mfa/verify', { mfaToken, code });
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* session already gone */ }
    setUser(null);
  }, []);

  const hasPermission = useCallback(
    (p: Permission) => !!user && user.permissions.includes(p),
    [user],
  );

  return (
    <AuthCtx.Provider value={{ user, loading, login, verifyMfa, logout, refresh, hasPermission }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="auth-wrap"><div className="muted" role="status">Loading session…</div></div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/** Renders children only when the current admin holds the permission. */
export function PermissionGate({ permission, children, fallback = null }: {
  permission: Permission; children: ReactNode; fallback?: ReactNode;
}) {
  const { hasPermission } = useAuth();
  return hasPermission(permission) ? <>{children}</> : <>{fallback}</>;
}

/** Full-page guard for routes that require a specific permission. */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { hasPermission, loading } = useAuth();
  if (loading) return null;
  if (!hasPermission(permission)) {
    return (
      <div className="page">
        <div className="state-box">
          <div className="state-icon" aria-hidden><Lock /></div>
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>You don’t have access to this module</div>
          <div className="small" style={{ marginTop: 4 }}>
            The permission <span className="mono">{permission}</span> is required. Ask a Super Admin if you need access.
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export { ApiError };
