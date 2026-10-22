import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import type { Store } from '../db/store.js';
import type { AppConfig } from '../config/env.js';
import { AppError, ConfigError, forbidden, unauthorized } from '../utils/errors.js';
import { effectivePermissions } from '../services/permissions.js';
import { nowIso, str } from '../utils/helpers.js';
import type { AdminRole, Permission, StaffUser } from '@atheleos/shared';

export interface AdminContext {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  permissions: Permission[];
  jti: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminContext;
      correlationId?: string;
      store?: Store;
      cfg?: AppConfig;
    }
  }
}

export function correlationMiddleware(req: Request, res: Response, next: NextFunction) {
  req.correlationId = crypto.randomUUID();
  res.setHeader('x-correlation-id', req.correlationId);
  next();
}

export async function writeAudit(
  store: Store,
  req: Request,
  action: string,
  resourceType: string,
  resourceId: string,
  reason = '',
  outcome: 'success' | 'failure' = 'success',
): Promise<void> {
  try {
    await store.addDoc('admin_audit_logs', {
      adminId: req.admin?.id ?? 'anonymous',
      adminEmail: req.admin?.email ?? '',
      action,
      resourceType,
      resourceId,
      reason,
      outcome,
      correlationId: req.correlationId ?? '',
      createdAt: nowIso(),
    });
  } catch { /* audit must never break the request in memory/unavailable modes */ }
}

export function toStaffUser(doc: { id: string; data: Record<string, unknown> }, permissions: Permission[]): StaffUser {
  const d = doc.data;
  return {
    id: doc.id,
    email: str(d.email),
    name: str(d.name),
    role: str(d.role, 'analyst') as AdminRole,
    permissions,
    mfaEnabled: d.mfaEnabled === true,
    status: (str(d.status, 'active') === 'disabled' ? 'disabled' : 'active') as StaffUser['status'],
    lastLoginAt: (d.lastLoginAt as string | null) ?? null,
    createdAt: str(d.createdAt),
  };
}

export function requireAuth(cfg: AppConfig, store: Store) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.atheleos_admin_session as string | undefined;
      if (!token) throw unauthorized('Missing session cookie');
      let payload: jwt.JwtPayload;
      try {
        payload = jwt.verify(token, cfg.ADMIN_JWT_SECRET) as jwt.JwtPayload;
      } catch { throw unauthorized('Invalid or expired session'); }
      const jti = str(payload.jti);
      const adminId = str(payload.sub);
      if (!jti || !adminId) throw unauthorized('Invalid session');
      const session = await store.getDoc(`admin_sessions/${jti}`);
      if (!session || session.data.revoked === true) throw unauthorized('Session revoked');
      const exp = session.data.expiresAt ? new Date(String(session.data.expiresAt)).getTime() : 0;
      if (exp && exp < Date.now()) throw unauthorized('Session expired');
      const adminDoc = await store.getDoc(`admin_users/${adminId}`);
      if (!adminDoc) throw unauthorized('Admin not found');
      if (str(adminDoc.data.status, 'active') === 'disabled') throw unauthorized('Admin account disabled');
      const role = str(adminDoc.data.role, 'analyst') as AdminRole;
      const permissions = await effectivePermissions(store, role);
      req.admin = { id: adminId, email: str(adminDoc.data.email), name: str(adminDoc.data.name), role, permissions, jti };
      next();
    } catch (e) { next(e); }
  };
}

export function requirePermission(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin) return next(unauthorized());
    const missing = perms.filter((p) => !req.admin!.permissions.includes(p));
    if (missing.length) return next(forbidden(`Missing permission: ${missing.join(', ')}`));
    next();
  };
}

export function requireAnyPermission(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin) return next(unauthorized());
    if (!perms.some((p) => req.admin!.permissions.includes(p))) return next(forbidden(`Requires one of: ${perms.join(', ')}`));
    next();
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ') } });
  }
  if (err instanceof ConfigError) {
    return res.status(503).json({ error: { code: 'FIREBASE_NOT_CONFIGURED', message: err.message } });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  const anyErr = err as { code?: string; status?: number; message?: string };
  if (anyErr?.code === 'FIREBASE_NOT_CONFIGURED') {
    return res.status(503).json({ error: { code: 'FIREBASE_NOT_CONFIGURED', message: anyErr.message ?? 'Firebase is not configured' } });
  }
  if (anyErr?.code === 'NOT_FOUND' && anyErr?.status === 404) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: anyErr.message ?? 'Not found' } });
  }
  // body-parser / json errors
  if (err instanceof SyntaxError) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } });
  }
  console.error('Unhandled error', err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
}
