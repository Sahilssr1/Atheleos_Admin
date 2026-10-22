import type { Store } from '../db/store.js';
import type { FirebaseAuthService } from '../db/firebaseAuth.js';
import { AppError } from '../utils/errors.js';
import { nowIso, str } from '../utils/helpers.js';

export async function suspendUser(store: Store, auth: FirebaseAuthService, userId: string, adminId: string, reason: string, expiresAt?: string | null): Promise<void> {
  const doc = await store.getDoc(`users/${userId}`);
  if (!doc) throw new AppError('NOT_FOUND', 'User not found', 404);
  await store.updateDoc(`users/${userId}`, {
    accountStatus: 'suspended',
    accountStatusReason: reason,
    accountStatusAt: nowIso(),
    accountStatusBy: adminId,
    accountStatusExpiresAt: expiresAt ?? null,
    isDeleted: false,
    updatedAt: nowIso(),
  });
  await auth.disableUser(userId);
}

export async function reinstateUser(store: Store, auth: FirebaseAuthService, userId: string, adminId: string, reason: string): Promise<void> {
  const doc = await store.getDoc(`users/${userId}`);
  if (!doc) throw new AppError('NOT_FOUND', 'User not found', 404);
  await store.updateDoc(`users/${userId}`, {
    accountStatus: 'active',
    accountStatusReason: reason,
    accountStatusAt: nowIso(),
    accountStatusBy: adminId,
    accountStatusExpiresAt: null,
    isDeleted: false,
    updatedAt: nowIso(),
  });
  await auth.enableUser(userId);
}

export async function restrictUser(store: Store, userId: string, adminId: string, reason: string, restrictions: string[], expiresAt?: string | null): Promise<void> {
  const doc = await store.getDoc(`users/${userId}`);
  if (!doc) throw new AppError('NOT_FOUND', 'User not found', 404);
  await store.updateDoc(`users/${userId}`, {
    accountStatus: 'restricted',
    accountStatusReason: reason,
    accountStatusAt: nowIso(),
    accountStatusBy: adminId,
    accountStatusExpiresAt: expiresAt ?? null,
    restrictions,
    updatedAt: nowIso(),
  });
}

export async function warnUser(store: Store, userId: string, adminId: string, reason: string, message: string): Promise<void> {
  const doc = await store.getDoc(`users/${userId}`);
  if (!doc) throw new AppError('NOT_FOUND', 'User not found', 404);
  await store.addDoc(`users/${userId}/notifications`, {
    type: 'system',
    title: 'Account warning',
    body: message || reason,
    read: false,
    createdAt: nowIso(),
    senderId: 'admin',
    data: { kind: 'warning', by: adminId },
  });
  await store.addDoc('moderation_actions', {
    userId, action: 'warn', reason, message, by: adminId, createdAt: nowIso(),
  });
}

export async function notifyUser(store: Store, userId: string, title: string, body: string, data: Record<string, unknown> = {}): Promise<void> {
  const doc = await store.getDoc(`users/${userId}`);
  if (!doc) return;
  await store.addDoc(`users/${userId}/notifications`, {
    type: 'system', title, body, read: false, createdAt: nowIso(), senderId: 'admin', data,
  });
}

export function userDisplay(d: Record<string, unknown>): string {
  return str(d.fullName ?? d.displayName ?? d.name ?? d.username, '');
}
