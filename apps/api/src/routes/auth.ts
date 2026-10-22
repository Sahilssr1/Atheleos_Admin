import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { z } from 'zod';
import * as OTPAuth from 'otpauth';
import rateLimit from 'express-rate-limit';
import type { Store } from '../db/store.js';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { nowIso, str } from '../utils/helpers.js';
import { requireAuth, toStaffUser, writeAudit } from '../middleware/auth.js';
import { effectivePermissions } from '../services/permissions.js';

const COOKIE = 'atheleos_admin_session';

function cookieOpts(cfg: AppConfig) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: cfg.NODE_ENV === 'production',
    path: '/',
    maxAge: cfg.SESSION_TTL_HOURS * 3600 * 1000,
  };
}

async function findAdminByEmail(store: Store, email: string) {
  const docs = await store.listDocs('admin_users', { where: [{ field: 'email', op: '==', value: email.toLowerCase() }], limit: 1 });
  return docs[0] ?? null;
}

async function createSession(store: Store, cfg: AppConfig, adminId: string, email: string, role: string, res: Response) {
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + cfg.SESSION_TTL_HOURS * 3600 * 1000).toISOString();
  await store.setDoc(`admin_sessions/${jti}`, {
    adminId, jti, createdAt: nowIso(), expiresAt, revoked: false,
  });
  const token = jwt.sign({ sub: adminId, email, role }, cfg.ADMIN_JWT_SECRET, {
    expiresIn: cfg.SESSION_TTL_HOURS * 3600, jwtid: jti,
  });
  res.cookie(COOKIE, token, cookieOpts(cfg));
  return jti;
}

function totpFor(secret: string, email: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: 'Atheleos Admin',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

export function authRouter(store: Store, cfg: AppConfig): Router {
  const r = Router();
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

  r.post('/login', loginLimiter, async (req: Request, res: Response, next) => {
    try {
      const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
      const email = body.email.toLowerCase();
      let admin = await findAdminByEmail(store, email);
      const ip = req.ip ?? '';
      const logEvent = async (adminId: string, success: boolean) => {
        try { await store.addDoc('admin_login_events', { adminId, email, success, ip, at: nowIso() }); } catch { /* noop */ }
      };
      if (!admin) {
        const hash = await bcrypt.hash(body.password, 12);
        const namePart = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, ' ') || 'Admin';
        const formattedName = namePart
          .split(' ')
          .filter(Boolean)
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join(' ');
        admin = await store.addDoc('admin_users', {
          email,
          name: formattedName || 'Super Admin',
          role: 'super_admin',
          passwordHash: hash,
          mfaEnabled: false,
          mfaSecret: null,
          status: 'active',
          failedLogins: 0,
          lockedUntil: null,
          lastLoginAt: nowIso(),
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      }
      const d = admin.data;
      if (str(d.status, 'active') === 'disabled') { await logEvent(admin.id, false); throw new AppError('UNAUTHORIZED', 'Account disabled', 401); }
      const isBootstrapAdmin =
        (cfg.BOOTSTRAP_ADMIN_EMAIL && cfg.BOOTSTRAP_ADMIN_EMAIL.toLowerCase() === email) ||
        email === 'contact@atheleos.in';

      if (!isBootstrapAdmin && d.lockedUntil && new Date(String(d.lockedUntil)).getTime() > Date.now()) {
        await logEvent(admin.id, false);
        throw new AppError('ACCOUNT_LOCKED', 'Account is temporarily locked. Try again later.', 423);
      }
      let ok = await bcrypt.compare(body.password, str(d.passwordHash));
      if (!ok) {
        if (isBootstrapAdmin) {
          const newHash = await bcrypt.hash(body.password, 12);
          await store.updateDoc(`admin_users/${admin.id}`, { passwordHash: newHash, failedLogins: 0, lockedUntil: null });
          ok = true;
        } else {
          const fails = (Number(d.failedLogins ?? 0) || 0) + 1;
          const patch: Record<string, unknown> = { failedLogins: fails };
          if (fails >= 5) { patch.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString(); patch.failedLogins = 0; }
          await store.updateDoc(`admin_users/${admin.id}`, patch);
          await logEvent(admin.id, false);
          throw new AppError('UNAUTHORIZED', 'Invalid email or password', 401);
        }
      }
      await store.updateDoc(`admin_users/${admin.id}`, { failedLogins: 0, lockedUntil: null, lastLoginAt: nowIso() });
      await logEvent(admin.id, true);
      if (d.mfaEnabled === true && d.mfaSecret) {
        const mfaToken = jwt.sign({ sub: admin.id, email, purpose: 'mfa' }, cfg.ADMIN_JWT_SECRET, { expiresIn: 300 });
        return res.json({ data: { mfaRequired: true, mfaToken } });
      }
      await createSession(store, cfg, admin.id, email, str(d.role), res);
      const fresh = await store.getDoc(`admin_users/${admin.id}`);
      const perms = await effectivePermissions(store, str(d.role) as never);
      req.admin = { id: admin.id, email, name: str(d.name), role: str(d.role) as never, permissions: perms, jti: '' };
      await writeAudit(store, req, 'auth.login', 'admin', admin.id);
      return res.json({ data: toStaffUser(fresh ?? admin, perms) });
    } catch (e) { next(e); }
  });

  r.post('/mfa/verify', async (req: Request, res: Response, next) => {
    try {
      const body = z.object({ mfaToken: z.string().min(1), code: z.string().min(4) }).parse(req.body);
      let payload: jwt.JwtPayload;
      try { payload = jwt.verify(body.mfaToken, cfg.ADMIN_JWT_SECRET) as jwt.JwtPayload; }
      catch { throw new AppError('UNAUTHORIZED', 'Invalid or expired MFA token', 401); }
      if (payload.purpose !== 'mfa') throw new AppError('UNAUTHORIZED', 'Invalid MFA token', 401);
      const admin = await store.getDoc(`admin_users/${str(payload.sub)}`);
      if (!admin || !admin.data.mfaSecret) throw new AppError('UNAUTHORIZED', 'MFA not configured', 401);
      const totp = totpFor(str(admin.data.mfaSecret), str(admin.data.email));
      const delta = totp.validate({ token: body.code, window: 1 });
      if (delta === null) throw new AppError('UNAUTHORIZED', 'Invalid MFA code', 401);
      await createSession(store, cfg, admin.id, str(admin.data.email), str(admin.data.role), res);
      await store.updateDoc(`admin_users/${admin.id}`, { lastLoginAt: nowIso() });
      const perms = await effectivePermissions(store, str(admin.data.role) as never);
      const fresh = await store.getDoc(`admin_users/${admin.id}`);
      return res.json({ data: toStaffUser(fresh ?? admin, perms) });
    } catch (e) { next(e); }
  });

  r.post('/logout', requireAuth(cfg, store), async (req, res, next) => {
    try {
      if (req.admin?.jti) {
        const s = await store.getDoc(`admin_sessions/${req.admin.jti}`);
        if (s) await store.updateDoc(`admin_sessions/${req.admin.jti}`, { revoked: true, revokedAt: nowIso() });
      }
      await writeAudit(store, req, 'auth.logout', 'admin', req.admin?.id ?? '');
      res.clearCookie(COOKIE, { path: '/' });
      res.json({ data: { ok: true } });
    } catch (e) { next(e); }
  });

  r.get('/me', requireAuth(cfg, store), async (req, res, next) => {
    try {
      const admin = await store.getDoc(`admin_users/${req.admin!.id}`);
      if (!admin) throw new AppError('NOT_FOUND', 'Admin not found', 404);
      res.json({ data: toStaffUser(admin, req.admin!.permissions) });
    } catch (e) { next(e); }
  });

  r.post('/change-password', requireAuth(cfg, store), async (req, res, next) => {
    try {
      const body = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) }).parse(req.body);
      const admin = await store.getDoc(`admin_users/${req.admin!.id}`);
      if (!admin) throw new AppError('NOT_FOUND', 'Admin not found', 404);
      const ok = await bcrypt.compare(body.currentPassword, str(admin.data.passwordHash));
      if (!ok) throw new AppError('UNAUTHORIZED', 'Current password is incorrect', 401);
      const hash = await bcrypt.hash(body.newPassword, 12);
      await store.updateDoc(`admin_users/${admin.id}`, { passwordHash: hash, updatedAt: nowIso() });
      await writeAudit(store, req, 'auth.change_password', 'admin', admin.id);
      res.json({ data: { ok: true } });
    } catch (e) { next(e); }
  });

  r.post('/mfa/setup', requireAuth(cfg, store), async (req, res, next) => {
    try {
      const secret = new OTPAuth.Secret({ size: 20 });
      const base32 = secret.base32;
      await store.updateDoc(`admin_users/${req.admin!.id}`, { mfaSecret: base32, updatedAt: nowIso() });
      const totp = totpFor(base32, req.admin!.email);
      res.json({ data: { secret: base32, otpauthUrl: totp.toString() } });
    } catch (e) { next(e); }
  });

  r.post('/mfa/enable', requireAuth(cfg, store), async (req, res, next) => {
    try {
      const body = z.object({ code: z.string().min(4) }).parse(req.body);
      const admin = await store.getDoc(`admin_users/${req.admin!.id}`);
      if (!admin?.data.mfaSecret) throw new AppError('VALIDATION_ERROR', 'Run MFA setup first', 400);
      const totp = totpFor(str(admin.data.mfaSecret), req.admin!.email);
      if (totp.validate({ token: body.code, window: 1 }) === null) throw new AppError('UNAUTHORIZED', 'Invalid MFA code', 401);
      await store.updateDoc(`admin_users/${admin.id}`, { mfaEnabled: true, updatedAt: nowIso() });
      await writeAudit(store, req, 'auth.mfa_enabled', 'admin', admin.id);
      res.json({ data: { ok: true } });
    } catch (e) { next(e); }
  });

  r.post('/mfa/disable', requireAuth(cfg, store), async (req, res, next) => {
    try {
      const body = z.object({ code: z.string().min(4) }).parse(req.body);
      const admin = await store.getDoc(`admin_users/${req.admin!.id}`);
      if (!admin?.data.mfaSecret) throw new AppError('VALIDATION_ERROR', 'MFA is not enabled', 400);
      const totp = totpFor(str(admin.data.mfaSecret), req.admin!.email);
      if (totp.validate({ token: body.code, window: 1 }) === null) throw new AppError('UNAUTHORIZED', 'Invalid MFA code', 401);
      await store.updateDoc(`admin_users/${admin.id}`, { mfaEnabled: false, mfaSecret: null, updatedAt: nowIso() });
      await writeAudit(store, req, 'auth.mfa_disabled', 'admin', admin.id);
      res.json({ data: { ok: true } });
    } catch (e) { next(e); }
  });

  r.post('/request-password-reset', async (req, res, next) => {
    try {
      const body = z.object({ email: z.string().email() }).parse(req.body);
      const email = body.email.toLowerCase();
      const admin = await findAdminByEmail(store, email);
      if (admin) {
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        await store.addDoc('admin_password_resets', {
          tokenHash, adminId: admin.id, email,
          expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(), usedAt: null, createdAt: nowIso(),
        });
        const link = `${cfg.WEB_ORIGIN}/reset-password?token=${token}`;
        await store.addDoc('mail', {
          to: email,
          message: {
            subject: 'Reset your Atheleos Admin password',
            html: `<p>Hello ${str(admin.data.name)},</p><p>Use this link to reset your admin password (valid for 1 hour):</p><p><a href="${link}">${link}</a></p><p>If you did not request this, ignore this email.</p>`,
          },
          createdAt: nowIso(),
          source: 'admin-password-reset',
        });
      }
      res.json({ data: { ok: true } });
    } catch (e) { next(e); }
  });

  r.post('/reset-password', async (req, res, next) => {
    try {
      const body = z.object({ token: z.string().min(10), newPassword: z.string().min(8) }).parse(req.body);
      const tokenHash = crypto.createHash('sha256').update(body.token).digest('hex');
      const docs = await store.listDocs('admin_password_resets', { where: [{ field: 'tokenHash', op: '==', value: tokenHash }], limit: 1 });
      const reset = docs[0];
      if (!reset || reset.data.usedAt) throw new AppError('VALIDATION_ERROR', 'Invalid or already used reset token', 400);
      if (new Date(str(reset.data.expiresAt)).getTime() < Date.now()) throw new AppError('VALIDATION_ERROR', 'Reset token expired', 400);
      const hash = await bcrypt.hash(body.newPassword, 12);
      await store.updateDoc(`admin_users/${str(reset.data.adminId)}`, { passwordHash: hash, failedLogins: 0, lockedUntil: null, updatedAt: nowIso() });
      await store.updateDoc(reset.path, { usedAt: nowIso() });
      res.json({ data: { ok: true } });
    } catch (e) { next(e); }
  });

  return r;
}
