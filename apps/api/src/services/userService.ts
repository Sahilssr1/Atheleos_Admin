import type { Store } from '../db/store.js';
import type { FirebaseAuthService } from '../db/firebaseAuth.js';
import type { AppConfig } from '../config/env.js';
import { getEnv } from '../config/env.js';
import { smtpTransport } from './emailService.js';
import { rawEmail } from './normalize.js';
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
  const expiryText = expiresAt ? ` until ${new Date(expiresAt).toLocaleDateString()}` : '';
  await notifyUser(store, userId, 'Account Suspended', `Your account has been suspended: ${reason}${expiryText}`, {
    kind: 'suspension', reason, expiresAt: expiresAt ?? null, by: adminId,
  });
  await store.addDoc('moderation_actions', {
    userId, action: 'users.suspend', targetType: 'user', targetId: userId, reason, expiresAt: expiresAt ?? null, by: adminId, createdAt: nowIso(),
  }).catch(() => undefined);
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
    restrictions: [],
    isDeleted: false,
    updatedAt: nowIso(),
  });
  await auth.enableUser(userId);
  await notifyUser(store, userId, 'Account Reinstated', `Your account access has been reinstated. Reason: ${reason}`, {
    kind: 'reinstate', reason, by: adminId,
  });
  await store.addDoc('moderation_actions', {
    userId, action: 'users.reinstate', targetType: 'user', targetId: userId, reason, by: adminId, createdAt: nowIso(),
  }).catch(() => undefined);
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
  const restrText = restrictions && restrictions.length ? ` (restrictions: ${restrictions.join(', ')})` : '';
  const expiryText = expiresAt ? ` until ${new Date(expiresAt).toLocaleDateString()}` : '';
  await notifyUser(store, userId, 'Account Restricted', `Your account has been restricted: ${reason}${restrText}${expiryText}`, {
    kind: 'restriction', reason, restrictions, expiresAt: expiresAt ?? null, by: adminId,
  });
  await store.addDoc('moderation_actions', {
    userId, action: 'users.restrict', targetType: 'user', targetId: userId, reason, restrictions, expiresAt: expiresAt ?? null, by: adminId, createdAt: nowIso(),
  }).catch(() => undefined);
}

export async function warnUser(store: Store, userId: string, adminId: string, reason: string, message: string): Promise<void> {
  const doc = await store.getDoc(`users/${userId}`);
  if (!doc) throw new AppError('NOT_FOUND', 'User not found', 404);
  await notifyUser(store, userId, 'Account warning', message || `Warning issued against your account: ${reason}`, {
    kind: 'warning', reason, message, by: adminId,
  });
  await store.addDoc('moderation_actions', {
    userId, action: 'warn', targetType: 'user', targetId: userId, reason, message, by: adminId, createdAt: nowIso(),
  }).catch(() => undefined);
}

export async function notifyUser(
  store: Store,
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
  cfgOverride?: AppConfig,
): Promise<void> {
  const doc = await store.getDoc(`users/${userId}`);
  if (!doc) return;
  await store.addDoc(`users/${userId}/notifications`, {
    type: 'system', title, body, read: false, createdAt: nowIso(), senderId: 'admin', data,
  });

  const userEmail = rawEmail(doc.data);
  if (userEmail) {
    const cfg = cfgOverride ?? getEnv();
    const recipientName = userDisplay(doc.data) || 'User';
    const subject = `[Atheleos] ${title}`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #0f172a; margin: 0; font-size: 24px; font-weight: 700;">Atheleos</h2>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Official Account Notice</p>
        </div>
        <div style="background-color: #ffffff; padding: 24px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <p style="font-size: 16px; color: #334155; margin-top: 0;">Hello <strong>${recipientName}</strong>,</p>
          <div style="padding: 16px; background-color: #f1f5f9; border-left: 4px solid #6366f1; border-radius: 4px; margin: 16px 0;">
            <h4 style="margin: 0 0 8px 0; color: #0f172a; font-size: 16px;">${title}</h4>
            <p style="margin: 0; color: #334155; font-size: 15px; line-height: 1.5;">${body}</p>
          </div>
          <p style="color: #64748b; font-size: 13px; margin: 16px 0 0 0;">
            If you have questions or believe this action was taken in error, you can reach our team at <a href="mailto:contact@atheleos.in" style="color: #4f46e5; text-decoration: none;">contact@atheleos.in</a>.
          </p>
        </div>
        <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #94a3b8;">
          &copy; ${new Date().getFullYear()} Atheleos Platform.
        </div>
      </div>
    `;

    if (cfg.smtpConfigured) {
      try {
        const info = await smtpTransport(cfg).sendMail({
          from: cfg.SMTP_FROM,
          to: userEmail,
          subject,
          html,
        });
        await store.addDoc('mail', {
          to: userEmail,
          message: { subject, html },
          delivery: { state: 'sent-via-smtp', messageId: info.messageId },
          createdAt: nowIso(),
          source: 'moderation-notice',
          userId,
          data,
        }).catch(() => undefined);
      } catch (err) {
        console.error(`Failed to send email to ${userEmail} via SMTP:`, err);
        await store.addDoc('mail', {
          to: userEmail,
          message: { subject, html },
          createdAt: nowIso(),
          source: 'moderation-notice',
          userId,
          data,
          error: err instanceof Error ? err.message : String(err),
        }).catch(() => undefined);
      }
    } else {
      await store.addDoc('mail', {
        to: userEmail,
        message: { subject, html },
        createdAt: nowIso(),
        source: 'moderation-notice',
        userId,
        data,
      }).catch(() => undefined);
    }
  }
}

export function userDisplay(d: Record<string, unknown>): string {
  return str(d.fullName ?? d.displayName ?? d.name ?? d.username, '');
}
