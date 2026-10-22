// Typed fetch wrapper for the Admin API (contract: docs/API_CONTRACT.md).
// Cookie auth (credentials: 'include'); success envelope { data }, error envelope
// { error: { code, message } }.

const rawBase = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();
const BASE = rawBase && rawBase.length > 0 ? rawBase : '/api/admin';

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
  /** Codes that mean an external integration is not configured on the API. */
  get isConfigError(): boolean {
    return this.code === 'FIREBASE_NOT_CONFIGURED' || this.code === 'EMAIL_NOT_CONFIGURED';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the admin API. Is it running?');
  }
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
    const apiErr = new ApiError(res.status, err?.code ?? 'HTTP_ERROR', err?.message ?? `Request failed (${res.status})`);
    if (res.status === 401 && !path.startsWith('/auth/login') && path !== '/auth/me') {
      // Session expired mid-use → back to login. (The /auth/me probe is handled
      // by AuthContext + ProtectedRoute instead, to avoid reload loops.)
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    throw apiErr;
  }
  return ((json as { data?: T } | null)?.data ?? (json as T)) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
};

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
