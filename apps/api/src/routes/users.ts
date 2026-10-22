import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Store } from '../db/store.js';
import type { AppConfig } from '../config/env.js';
import { AppError, forbidden } from '../utils/errors.js';
import { nowIso, paginate, pagination, str } from '../utils/helpers.js';
import { requireAuth, requirePermission, writeAudit } from '../middleware/auth.js';
import { normalizeUser, normalizeContent, normalizeReport, normalizeVerification } from '../services/normalize.js';
import { reinstateUser, restrictUser, suspendUser, warnUser } from '../services/userService.js';
import type { FirebaseAuthService } from '../db/firebaseAuth.js';

const reasonBody = z.object({ reason: z.string().min(1), expiresAt: z.string().nullable().optional() });

export function usersRouter(store: Store, cfg: AppConfig, fbAuth: FirebaseAuthService): Router {
  const r = Router();
  const auth = requireAuth(cfg, store);

  r.get('/', auth, requirePermission('users.view'), async (req, res, next) => {
    try {
      const { page, pageSize } = pagination(req.query as Record<string, unknown>);
      const docs = await store.listDocs('users', { limit: 100000 });
      const canContact = req.admin!.permissions.includes('users.view_contact');
      let users = docs.map((d) => normalizeUser(d, canContact));
      const q = str(req.query.q).toLowerCase();
      if (q) users = users.filter((u) => [u.username, u.displayName, u.email ?? '', u.id, u.sport, u.city].some((f) => f.toLowerCase().includes(q)));
      const status = str(req.query.status);
      if (status) users = users.filter((u) => u.accountStatus === status);
      const role = str(req.query.role);
      if (role) users = users.filter((u) => u.role.toLowerCase() === role.toLowerCase());
      const verified = str(req.query.verified);
      if (verified === 'true') users = users.filter((u) => u.verified);
      if (verified === 'false') users = users.filter((u) => !u.verified);
      const sort = str(req.query.sort, 'createdAt:desc');
      const [field, dir] = sort.split(':');
      users.sort((a, b) => {
        const av = String((a as unknown as Record<string, unknown>)[field] ?? '');
        const bv = String((b as unknown as Record<string, unknown>)[field] ?? '');
        return (av < bv ? -1 : av > bv ? 1 : 0) * (dir === 'asc' ? 1 : -1);
      });
      res.json({ data: paginate(users, page, pageSize) });
    } catch (e) { next(e); }
  });

  r.get('/verifications/list', auth, requirePermission('users.verify'), async (req, res, next) => {
    try {
      const { page, pageSize } = pagination(req.query as Record<string, unknown>);
      const docs = await store.collectionGroup('verification_applications', { limit: 100000 });
      let items = docs.map(normalizeVerification);
      const status = str(req.query.status);
      if (status) items = items.filter((i) => i.status === status);
      res.json({ data: paginate(items, page, pageSize) });
    } catch (e) { next(e); }
  });

  // Contract path: GET /verifications is mounted separately in app.ts; keep alias here too via /verifications handled there.

  r.get('/:id', auth, requirePermission('users.view'), async (req, res, next) => {
    try {
      const doc = await store.getDoc(`users/${req.params.id}`);
      if (!doc) throw new AppError('NOT_FOUND', 'User not found', 404);
      const canContact = req.admin!.permissions.includes('users.view_contact');
      const user = normalizeUser(doc, canContact);
      const posts = await store.listDocs('posts', { limit: 100000 });
      const content = posts.filter((p) => [p.data.authorId, p.data.userId, p.data.uid].some((v) => str(v) === req.params.id)).slice(0, 100).map((p) => normalizeContent(p));
      const stories = await store.listDocs('stories', { limit: 100000 });
      const storyItems = stories.filter((p) => [p.data.authorId, p.data.userId, p.data.uid].some((v) => str(v) === req.params.id)).map((p) => normalizeContent(p, 'story'));
      const reportsAll = await store.listDocs('reports', { limit: 100000 });
      const reports = reportsAll.filter((x) => str(x.data.targetId) === req.params.id || str(x.data.uid) === req.params.id || str(x.data.reporterId) === req.params.id).map(normalizeReport);
      const support = reportsAll.filter((x) => str(x.data.uid) === req.params.id).map(normalizeReport);
      const audits = await store.listDocs('admin_audit_logs', { limit: 100000 });
      const restrictions = audits.filter((a) => a.data.resourceId === req.params.id).map((a) => ({
        id: a.id, adminId: str(a.data.adminId), action: str(a.data.action), reason: str(a.data.reason), createdAt: str(a.data.createdAt),
      }));
      const actions = await store.listDocs('moderation_actions', { where: [{ field: 'userId', op: '==', value: req.params.id }], limit: 1000 }).catch(() => []);
      res.json({ data: { user, content: [...content, ...storyItems], reports, restrictions: [...restrictions, ...actions.map((a) => ({ id: a.id, ...a.data }))], support } });
    } catch (e) { next(e); }
  });

  r.post('/:id/suspend', auth, requirePermission('users.suspend'), async (req: Request, res, next) => {
    try {
      const body = reasonBody.parse(req.body);
      await suspendUser(store, fbAuth, req.params.id, req.admin!.id, body.reason, body.expiresAt ?? null);
      await writeAudit(store, req, 'users.suspend', 'user', req.params.id, body.reason);
      res.json({ data: { ok: true } });
    } catch (e) { next(e); }
  });

  r.post('/:id/reinstate', auth, requirePermission('users.suspend'), async (req: Request, res, next) => {
    try {
      const body = z.object({ reason: z.string().min(1) }).parse(req.body);
      await reinstateUser(store, fbAuth, req.params.id, req.admin!.id, body.reason);
      await writeAudit(store, req, 'users.reinstate', 'user', req.params.id, body.reason);
      res.json({ data: { ok: true } });
    } catch (e) { next(e); }
  });

  r.post('/:id/restrict', auth, requirePermission('users.restrict'), async (req: Request, res, next) => {
    try {
      const body = z.object({ reason: z.string().min(1), restrictions: z.array(z.string()).default([]), expiresAt: z.string().nullable().optional() }).parse(req.body);
      await restrictUser(store, req.params.id, req.admin!.id, body.reason, body.restrictions, body.expiresAt ?? null);
      await writeAudit(store, req, 'users.restrict', 'user', req.params.id, body.reason);
      res.json({ data: { ok: true } });
    } catch (e) { next(e); }
  });

  r.post('/:id/warn', auth, requirePermission('users.warn'), async (req: Request, res, next) => {
    try {
      const body = z.object({ reason: z.string().min(1), message: z.string().default('') }).parse(req.body);
      await warnUser(store, req.params.id, req.admin!.id, body.reason, body.message);
      await writeAudit(store, req, 'users.warn', 'user', req.params.id, body.reason);
      res.json({ data: { ok: true } });
    } catch (e) { next(e); }
  });

  r.post('/:id/delete', auth, requirePermission('users.delete'), async (req: Request, res, next) => {
    try {
      const body = z.object({ reason: z.string().min(1) }).parse(req.body);
      const doc = await store.getDoc(`users/${req.params.id}`);
      if (!doc) throw new AppError('NOT_FOUND', 'User not found', 404);
      await store.updateDoc(`users/${req.params.id}`, {
        accountStatus: 'deleted', isDeleted: true, accountStatusReason: body.reason,
        accountStatusAt: nowIso(), accountStatusBy: req.admin!.id, updatedAt: nowIso(),
      });
      await fbAuth.disableUser(req.params.id);
      await writeAudit(store, req, 'users.delete', 'user', req.params.id, body.reason);
      res.json({ data: { ok: true } });
    } catch (e) { next(e); }
  });

  r.post('/:id/purge', auth, requirePermission('users.delete'), async (req: Request, res, next) => {
    try {
      if (req.admin!.role !== 'super_admin') throw forbidden('Purge requires Super Admin');
      const body = z.object({ reason: z.string().min(1), confirm: z.string() }).parse(req.body);
      if (body.confirm !== 'DELETE') throw new AppError('VALIDATION_ERROR', "confirm must be 'DELETE'", 400);
      const doc = await store.getDoc(`users/${req.params.id}`);
      if (!doc) throw new AppError('NOT_FOUND', 'User not found', 404);
      await writeAudit(store, req, 'users.purge', 'user', req.params.id, body.reason);
      await store.deleteDoc(`users/${req.params.id}`);
      await fbAuth.deleteUser(req.params.id);
      res.json({ data: { ok: true } });
    } catch (e) { next(e); }
  });

  return r;
}

export function verificationsRouter(store: Store, cfg: AppConfig): Router {
  const r = Router();
  const auth = requireAuth(cfg, store);
  r.get('/', auth, requirePermission('users.verify'), async (req, res, next) => {
    try {
      const { page, pageSize } = pagination(req.query as Record<string, unknown>);
      const docs = await store.collectionGroup('verification_applications', { limit: 100000 });
      let items = docs.map(normalizeVerification);
      // enrich with user info when available
      const status = str(req.query.status);
      if (status) items = items.filter((i) => i.status === status);
      res.json({ data: paginate(items, page, pageSize) });
    } catch (e) { next(e); }
  });
  r.post('/:uid/:applicationId/decide', auth, requirePermission('users.verify'), async (req: Request, res, next) => {
    try {
      const body = z.object({
        decision: z.enum(['approved', 'rejected', 'moreInfoRequired', 'underReview']),
        reason: z.string().default(''),
        badge: z.string().optional(),
        level: z.string().optional(),
      }).parse(req.body);
      const path = `users/${req.params.uid}/verification_applications/${req.params.applicationId}`;
      const app = await store.getDoc(path);
      if (!app) throw new AppError('NOT_FOUND', 'Verification application not found', 404);
      const userDoc = await store.getDoc(`users/${req.params.uid}`);
      if (!userDoc) throw new AppError('NOT_FOUND', 'User not found', 404);
      await store.updateDoc(path, {
        status: body.decision, decisionReason: body.reason, reviewedBy: req.admin!.id,
        reviewedAt: nowIso(), updatedAt: nowIso(),
      });
      const userUpdate: Record<string, unknown> = { verificationStatus: body.decision, updatedAt: nowIso() };
      if (body.decision === 'approved') {
        userUpdate.verified = true;
        if (body.badge) userUpdate.verificationBadge = body.badge;
        if (body.level) userUpdate.verificationLevel = body.level;
      }
      if (body.decision === 'rejected') userUpdate.verified = false;
      await store.updateDoc(`users/${req.params.uid}`, userUpdate);
      const title = body.decision === 'approved' ? 'Verification approved' : body.decision === 'rejected' ? 'Verification rejected' : 'Verification update';
      await store.addDoc(`users/${req.params.uid}/notifications`, {
        type: 'system', title, body: body.reason || `Your verification application was ${body.decision}.`,
        read: false, createdAt: nowIso(), senderId: 'admin', data: { kind: 'verification', decision: body.decision },
      });
      await writeAudit(store, req, 'users.verify_decide', 'verification', req.params.applicationId, body.reason || body.decision);
      res.json({ data: { ok: true } });
    } catch (e) { next(e); }
  });
  return r;
}
