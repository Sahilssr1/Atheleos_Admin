import type { StaffUser } from '@atheleos/shared';
import { DEFAULT_ROLE_PERMISSIONS } from '@atheleos/shared';

export function staffUser(overrides: Partial<StaffUser> = {}): StaffUser {
  return {
    id: 'staff-1',
    email: 'admin@atheleos.app',
    name: 'Test Admin',
    role: 'support',
    permissions: [...DEFAULT_ROLE_PERMISSIONS.support],
    mfaEnabled: false,
    status: 'active',
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Install a fetch mock that answers with the JSON envelope { data }. */
export function mockFetch(handler: (url: string, init?: RequestInit) => { status?: number; body: unknown }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const { status = 200, body } = handler(url, init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  vi.stubGlobal('fetch', fn);
  return calls;
}

export function jsonOk(data: unknown) {
  return { status: 200, body: { data } };
}
