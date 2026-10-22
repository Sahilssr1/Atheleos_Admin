import { Router, type Request } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { ADMIN_ROLES, PERMISSIONS, type AdminRole, type Permission } from '@atheleos/shared';
import type { Store } from '../db/store.js';
import type { AppConfig } from '../config/env.js';
import { AppError, forbidden } from '../utils/errors.js';
import { nowIso, paginate, pagination, stripSecrets, str } from '../utils/helpers.js';
import { requireAnyPermission, requireAuth, requirePermission, toStaffUser, writeAudit } from '../middleware/auth.js';
import { effectivePermissions, getRolesConfig, mergedRoleMatrix } from '../services/permissions.js';
import { checkImap, verifySmtp } from '../services/emailService.js';

export function adminsRouter(store: Store, cfg: AppConfig): Router {
  const r = Router();
  const auth = requireAuth(cfg, store);

  r.get('/', auth, requirePermission('admins.manage'), async (req, res, next) => {
    try {
      const docs = await store.listDocs('admin_users', { limit: 100000 });
      const items = [];
      for (const d of docs) items.push(toStaffUser(d, await effectivePermissions(store, str(d.data.role, 'analyst') as AdminRole)));
      res.json({ data: { items, page: 1, pageSize: items.length, total: items.length } });
    } catch (e) { next(e); }
  });

  r.post('/', auth, requirePermission('admins.manage'), async (req: Request, res, next) => {
    try {
      const body = z.object({
        email: z.string().email(), name: z.string().min(1),
        role: z.enum(ADMIN_ROLES), password: z.string().min(8),
      }).parse(req.body);
      const email = body.email.toLowerCase();
      if (cfg.adminEmailDomains.length) {
        const domain = email.split('@')[1] ?? '';
        if (!cfg.adminEmailDomains.includes(domain)) throw new AppError('VALIDATION_ERROR', 'Email domain is not allowed for admin accounts', 400);
      }
      const existing = await store.listDocs('admin_users', { where: [{ field: 'email', op: '==', value: email }], limit: 1 });
      if (existing.length) throw new AppError('CONFLICT', 'An admin with this email already exists', 409);
      const hash = await bcrypt.hash(body.password, 12);
      const doc = await store.addDoc('admin_users', {
        email, name: body.name, role: body.role, passwordHash: hash,
        mfaEnabled: false, mfaSecret: null, status: 'active', failedLogins: 0, lockedUntil: null,
        lastLoginAt: null, createdAt: nowIso(), updatedAt: nowIso(),
      });
      await writeAudit(store, req, 'admins.create', 'admin', doc.id, body.role);
      res.status(201).json({ data: toStaffUser(doc, await effectivePermissions(store, body.role)) });
    } catch (e) { next(e); }
  });

  r.patch('/:id', auth, requirePermission('admins.manage'), async (req: Request, res, next) => {
    try {
      const body = z.object({
        role: z.enum(ADMIN_ROLES).optional(),
        status: z.enum(['active', 'disabled']).optional(),
        name: z.string().min(1).optional(),
      }).parse(req.body);
      const doc = await store.getDoc(`admin_users/${req.params.id}`);
      if (!doc) throw new AppError('NOT_FOUND', 'Admin not found', 404);
      const isSelf = req.params.id === req.admin!.id;
      if (isSelf && body.status === 'disabled') throw forbidden('You cannot disable your own account');
      if (isSelf && body.role && body.role !== 'super_admin' && str(doc.data.role) === 'super_admin') throw forbidden('You cannot demote yourself');
      const demotesOrDisablesSuper = str(doc.data.role) === 'super_admin' && ((body.role && body.role !== 'super_admin') || body.status === 'disabled');
      if (demotesOrDisablesSuper) {
        const all = await store.listDocs('admin_users', { limit: 100000 });
        const supers = all.filter((a) => str(a.data.role) === 'super_admin' && str(a.data.status, 'active') === 'active' && a.id !== req.params.id);
        if (!supers.length) throw forbidden('Cannot remove the last active Super Admin');
      }
      const updated = await store.updateDoc(doc.path, { ...body, updatedAt: nowIso() });
      await writeAudit(store, req, 'admins.update', 'admin', req.params.id, JSON.stringify(body));
      // Permission/role changes are visible to the security center via audit action names.
      if (body.role) await writeAudit(store, req, 'roles.permission_change', 'admin', req.params.id, `role→${body.role}`);
      res.json({ data: toStaffUser(updated, await effectivePermissions(store, str(updated.data.role, 'analyst') as AdminRole)) });
    } catch (e) { next(e); }
  });

  r.post('/:id/reset-password', auth, requirePermission('admins.manage'), async (req: Request, res, next) => {
    try {
      const body = z.object({ newPassword: z.string().min(8).optional() }).passthrough().parse(req.body ?? {});
      const doc = await store.getDoc(`admin_users/${req.params.id}`);
      if (!doc) throw new AppError('NOT_FOUND', 'Admin not found', 404);
      if (body.newPassword) {
        const hash = await bcrypt.hash(body.newPassword, 12);
        await store.updateDoc(doc.path, { passwordHash: hash, failedLogins: 0, lockedUntil: null, updatedAt: nowIso() });
        await writeAudit(store, req, 'admins.reset_password', 'admin', req.params.id);
        return res.json({ data: { ok: true, via: 'direct' } });
      }
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await store.addDoc('admin_password_resets', {
        tokenHash, adminId: doc.id, email: str(doc.data.email),
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(), usedAt: null, createdAt: nowIso(),
      });
      const link = `${cfg.WEB_ORIGIN}/reset-password?token=${token}`;
      await store.addDoc('mail', {
        to: str(doc.data.email),
        message: { subject: 'Reset your Atheleos Admin password', html: `<p>An administrator requested a password reset for your account.</p><p><a href="${link}">${link}</a></p>` },
        createdAt: nowIso(), source: 'admin-reset-by-admin',
      });
      await writeAudit(store, req, 'admins.reset_password', 'admin', req.params.id, 'token issued');
      res.json({ data: { ok: true, via: 'email' } });
    } catch (e) { next(e); }
  });
  return r;
}

export function rolesRouter(store: Store, cfg: AppConfig): Router {
  const r = Router();
  const auth = requireAuth(cfg, store);
  r.get('/', auth, requireAnyPermission('roles.manage', 'admins.manage'), async (req, res, next) => {
    try {
      const matrix = await mergedRoleMatrix(store);
      res.json({ data: { roles: matrix, permissions: [...PERMISSIONS] } });
    } catch (e) { next(e); }
  });
  r.put('/:role', auth, requirePermission('roles.manage'), async (req: Request, res, next) => {
    try {
      const role = req.params.role as AdminRole;
      if (!(ADMIN_ROLES as readonly string[]).includes(role)) throw new AppError('VALIDATION_ERROR', 'Unknown role', 400);
      if (role === 'super_admin') throw new AppError('VALIDATION_ERROR', 'Super Admin permissions cannot be reduced', 400);
      const body = z.object({ permissions: z.array(z.string()) }).parse(req.body);
      const invalid = body.permissions.filter((p) => !(PERMISSIONS as readonly string[]).includes(p));
      if (invalid.length) throw new AppError('VALIDATION_ERROR', `Unknown permissions: ${invalid.join(', ')}`, 400);
      const current = await getRolesConfig(store);
      current[role] = body.permissions as Permission[];
      await store.setDoc('admin_config/roles', current as unknown as Record<string, unknown>, false);
      await writeAudit(store, req, 'roles.permission_change', 'role', role, body.permissions.join(','));
      const matrix = await mergedRoleMatrix(store);
      res.json({ data: { roles: matrix } });
    } catch (e) { next(e); }
  });
  return r;
}

export function auditRouter(store: Store, cfg: AppConfig): Router {
  const r = Router();
  const auth = requireAuth(cfg, store);
  r.get('/', auth, requirePermission('audit.view'), async (req, res, next) => {
    try {
      const { page, pageSize } = pagination(req.query as Record<string, unknown>);
      const docs = await store.listDocs('admin_audit_logs', { limit: 100000 });
      let items = docs.map((d) => ({
        id: d.id, adminId: str(d.data.adminId), adminEmail: str(d.data.adminEmail), action: str(d.data.action),
        resourceType: str(d.data.resourceType), resourceId: str(d.data.resourceId), reason: str(d.data.reason),
        outcome: (str(d.data.outcome, 'success') === 'failure' ? 'failure' : 'success') as 'success' | 'failure',
        correlationId: str(d.data.correlationId), createdAt: str(d.data.createdAt),
      }));
      const action = str(req.query.action); if (action) items = items.filter((i) => i.action === action || i.action.includes(action));
      const adminId = str(req.query.adminId); if (adminId) items = items.filter((i) => i.adminId === adminId);
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      res.json({ data: paginate(items, page, pageSize) });
    } catch (e) { next(e); }
  });
  return r;
}

export function settingsRouter(store: Store, cfg: AppConfig): Router {
  const r = Router();
  const auth = requireAuth(cfg, store);
  r.get('/', auth, requireAnyPermission('settings.manage', 'system.view'), async (req, res, next) => {
    try {
      const doc = await store.getDoc('admin_config/platform');
      const data = doc ? stripSecrets(doc.data) : {};
      res.json({
        data: {
          ...data,
          integrations: {
            firebaseConfigured: cfg.firebaseConfigured, dataMode: cfg.DATA_MODE,
            smtpConfigured: cfg.smtpConfigured, imapConfigured: cfg.imapConfigured,
            smtpFrom: cfg.SMTP_FROM, mediaWorkerConfigured: Boolean(cfg.MEDIA_WORKER_URL),
            functionsConfigured: Boolean(cfg.FUNCTIONS_BASE_URL),
          },
        },
      });
    } catch (e) { next(e); }
  });
  r.patch('/', auth, requirePermission('settings.manage'), async (req: Request, res, next) => {
    try {
      const body = z.record(z.unknown()).parse(req.body);
      const safe = stripSecrets(body as Record<string, unknown>);
      const existing = await store.getDoc('admin_config/platform');
      const merged = { ...(existing?.data ?? {}), ...safe, updatedAt: nowIso(), updatedBy: req.admin!.id };
      await store.setDoc('admin_config/platform', merged, false);
      await writeAudit(store, req, 'settings.update', 'settings', 'platform', Object.keys(safe).join(','));
      res.json({ data: stripSecrets(merged) });
    } catch (e) { next(e); }
  });
  return r;
}

export function securityRouter(store: Store, cfg: AppConfig): Router {
  const r = Router();
  const auth = requireAuth(cfg, store);
  r.get('/overview', auth, requirePermission('security.view'), async (req, res, next) => {
    try {
      const [events, sessions, audits] = await Promise.all([
        store.listDocs('admin_login_events', { limit: 100000 }).catch(() => []),
        store.listDocs('admin_sessions', { limit: 100000 }).catch(() => []),
        store.listDocs('admin_audit_logs', { limit: 100000 }).catch(() => []),
      ]);
      const now = Date.now();
      const failedIn = (ms: number) => events.filter((e) => e.data.success === false && new Date(str(e.data.at)).getTime() >= now - ms).length;
      const activeSessions = sessions.filter((s) => s.data.revoked !== true && (!s.data.expiresAt || new Date(str(s.data.expiresAt)).getTime() > now));
      res.json({
        data: {
          recentLogins: [...events].sort((a, b) => str(b.data.at).localeCompare(str(a.data.at))).slice(0, 20)
            .map((e) => ({ id: e.id, adminId: str(e.data.adminId), email: str(e.data.email), success: e.data.success === true, ip: str(e.data.ip), at: str(e.data.at) })),
          failedAttempts24h: failedIn(24 * 3600 * 1000),
          failedAttempts7d: failedIn(7 * 24 * 3600 * 1000),
          activeSessions: activeSessions.length,
          permissionChanges: [...audits].filter((a) => str(a.data.action).includes('permission') || str(a.data.action).startsWith('roles.'))
            .sort((a, b) => str(b.data.createdAt).localeCompare(str(a.data.createdAt))).slice(0, 20)
            .map((a) => ({ id: a.id, adminId: str(a.data.adminId), action: str(a.data.action), resourceId: str(a.data.resourceId), reason: str(a.data.reason), createdAt: str(a.data.createdAt) })),
          integrations: {
            firebaseConfigured: cfg.firebaseConfigured, smtpConfigured: cfg.smtpConfigured, imapConfigured: cfg.imapConfigured,
          },
        },
      });
    } catch (e) { next(e); }
  });
  return r;
}

async function fetchCheck(url: string): Promise<{ status: 'up' | 'down' | 'not_configured'; latencyMs: number | null }> {
  if (!url) return { status: 'not_configured', latencyMs: null };
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return { status: res.status < 500 ? 'up' : 'down', latencyMs: Date.now() - start };
  } catch { return { status: 'down', latencyMs: Date.now() - start }; }
}

export function systemRouter(store: Store, cfg: AppConfig): Router {
  const r = Router();
  r.get('/health/public', (_req, res) => { res.json({ ok: true }); });
  r.get('/health', requireAuth(cfg, store), requirePermission('system.view'), async (req, res, next) => {
    try {
      const start = Date.now();
      const storeOk = await store.ping().catch(() => false);
      const [smtp, imap, worker, functions] = await Promise.all([
        verifySmtp(cfg), checkImap(cfg), fetchCheck(cfg.MEDIA_WORKER_URL), fetchCheck(cfg.FUNCTIONS_BASE_URL),
      ]);
      res.json({
        data: {
          ok: storeOk,
          checks: {
            firestore: { status: store.kind === 'unavailable' ? 'not_configured' : storeOk ? 'up' : 'down', latencyMs: Date.now() - start, mode: cfg.DATA_MODE },
            smtp, imap,
            mediaWorker: worker,
            functions,
          },
          checkedAt: nowIso(),
        },
      });
    } catch (e) { next(e); }
  });
  return r;
}
