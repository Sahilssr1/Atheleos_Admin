import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Store } from '../db/store.js';
import type { AppConfig } from '../config/env.js';
import type { FirebaseAuthService } from '../db/firebaseAuth.js';
import { AppError } from '../utils/errors.js';
import { nowIso, paginate, pagination, str } from '../utils/helpers.js';
import { requireAuth, requirePermission, writeAudit } from '../middleware/auth.js';
import { normalizeAppeal, normalizeCase, normalizeReport } from '../services/normalize.js';
import { applyCommentAction, applyContentAction } from '../services/contentService.js';
import { notifyUser, reinstateUser, restrictUser, suspendUser, warnUser } from '../services/userService.js';
import type { ContentType } from '@atheleos/shared';

export function moderationRouter(store: Store, cfg: AppConfig, fbAuth: FirebaseAuthService): Router {
  const r = Router();
  const auth = requireAuth(cfg, store);

  r.get('/cases', auth, requirePermission('moderation.view'), async (req, res, next) => {
    try {
      const { page, pageSize } = pagination(req.query as Record<string, unknown>);
      const docs = await store.listDocs('moderation_cases', { limit: 100000 });
      let items = docs.map(normalizeCase);
      const status = str(req.query.status); if (status) items = items.filter((i) => i.status === status);
      const priority = str(req.query.priority); if (priority) items = items.filter((i) => i.priority === priority);
      const assignedTo = str(req.query.assignedTo); if (assignedTo) items = items.filter((i) => i.assignedTo === assignedTo);
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      res.json({ data: paginate(items, page, pageSize) });
    } catch (e) { next(e); }
  });

  r.post('/cases', auth, requirePermission('moderation.view'), async (req: Request, res, next) => {
    try {
      const body = z.object({
        reportId: z.string().nullable().optional(),
        targetType: z.string().min(1),
        targetId: z.string().min(1),
        targetAuthorId: z.string().optional().default(''),
        reason: z.string().min(1),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
        evidence: z.array(z.string()).optional().default([]),
      }).parse(req.body);
      const doc = await store.addDoc('moderation_cases', {
        reportId: body.reportId ?? null, targetType: body.targetType, targetId: body.targetId,
        targetAuthorId: body.targetAuthorId, reason: body.reason, evidence: body.evidence,
        status: 'new', priority: body.priority, assignedTo: null, decision: null,
        decisionReason: null, decidedBy: null, notes: [], createdAt: nowIso(), updatedAt: nowIso(),
      });
      await writeAudit(store, req, 'moderation.case_create', 'moderation_case', doc.id, body.reason);
      res.status(201).json({ data: normalizeCase(doc) });
    } catch (e) { next(e); }
  });

  r.get('/cases/:id', auth, requirePermission('moderation.view'), async (req, res, next) => {
    try {
      const doc = await store.getDoc(`moderation_cases/${req.params.id}`);
      if (!doc) throw new AppError('NOT_FOUND', 'Moderation case not found', 404);
      res.json({ data: normalizeCase(doc) });
    } catch (e) { next(e); }
  });

  r.patch('/cases/:id', auth, requirePermission('moderation.view'), async (req: Request, res, next) => {
    try {
      const body = z.object({
        assignedTo: z.string().nullable().optional(),
        status: z.enum(['new', 'under_review', 'escalated', 'action_taken', 'dismissed', 'appealed', 'closed']).optional(),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
      }).parse(req.body);
      const doc = await store.getDoc(`moderation_cases/${req.params.id}`);
      if (!doc) throw new AppError('NOT_FOUND', 'Moderation case not found', 404);
      const updated = await store.updateDoc(doc.path, { ...body, updatedAt: nowIso() });
      await writeAudit(store, req, 'moderation.case_update', 'moderation_case', req.params.id);
      res.json({ data: normalizeCase(updated) });
    } catch (e) { next(e); }
  });

  r.post('/cases/:id/note', auth, requirePermission('moderation.view'), async (req: Request, res, next) => {
    try {
      const body = z.object({ text: z.string().min(1) }).parse(req.body);
      const doc = await store.getDoc(`moderation_cases/${req.params.id}`);
      if (!doc) throw new AppError('NOT_FOUND', 'Moderation case not found', 404);
      const notes = Array.isArray(doc.data.notes) ? [...(doc.data.notes as unknown[])] : [];
      notes.push({ by: req.admin!.id, text: body.text, at: nowIso() });
      const updated = await store.updateDoc(doc.path, { notes, updatedAt: nowIso() });
      res.json({ data: normalizeCase(updated) });
    } catch (e) { next(e); }
  });

  r.post('/cases/:id/decide', auth, requirePermission('moderation.decide'), async (req: Request, res, next) => {
    try {
      const body = z.object({
        decision: z.string().min(1),
        reason: z.string().min(1),
        contentAction: z.enum(['hide', 'restore', 'remove']).nullable().optional(),
        accountAction: z.enum(['suspend', 'restrict', 'warn', 'reinstate']).nullable().optional(),
      }).parse(req.body);
      const doc = await store.getDoc(`moderation_cases/${req.params.id}`);
      if (!doc) throw new AppError('NOT_FOUND', 'Moderation case not found', 404);
      const c = normalizeCase(doc);
      // Apply content action
      if (body.contentAction) {
        if (c.targetType === 'comment') {
          // targetId expected as commentId; postId may be in evidence/meta — try collection-group lookup
          const comments = await store.collectionGroup('comments', { limit: 100000 });
          const found = comments.find((x) => x.id === c.targetId);
          if (found) {
            const segs = found.path.split('/');
            const postId = segs[segs.length - 3];
            await applyCommentAction(store, postId, c.targetId, body.contentAction, req.admin!.id, body.reason);
          }
        } else if (['post', 'clip', 'story', 'event'].includes(c.targetType)) {
          await applyContentAction(store, c.targetType as ContentType, c.targetId, body.contentAction, req.admin!.id, body.reason);
        }
      }
      // Apply account action
      const targetUserId = c.targetAuthorId || (c.targetType === 'user' ? c.targetId : '');
      if (body.accountAction && targetUserId) {
        if (body.accountAction === 'suspend') await suspendUser(store, fbAuth, targetUserId, req.admin!.id, body.reason);
        else if (body.accountAction === 'reinstate') await reinstateUser(store, fbAuth, targetUserId, req.admin!.id, body.reason);
        else if (body.accountAction === 'restrict') await restrictUser(store, targetUserId, req.admin!.id, body.reason, ['moderation']);
        else if (body.accountAction === 'warn') await warnUser(store, targetUserId, req.admin!.id, body.reason, body.reason);
      }
      const dismissed = ['dismiss', 'dismissed', 'no_action'].includes(body.decision.toLowerCase());
      const updated = await store.updateDoc(doc.path, {
        status: dismissed ? 'dismissed' : 'action_taken',
        decision: body.decision, decisionReason: body.reason, decidedBy: req.admin!.id, updatedAt: nowIso(),
      });
      if (doc.data.reportId) {
        const rep = await store.getDoc(`reports/${String(doc.data.reportId)}`);
        if (rep) await store.updateDoc(rep.path, { status: dismissed ? 'dismissed' : 'action_taken', updatedAt: nowIso() }).catch(() => undefined);
      }
      await writeAudit(store, req, 'moderation.decide', 'moderation_case', req.params.id, body.reason);
      res.json({ data: normalizeCase(updated) });
    } catch (e) { next(e); }
  });
  return r;
}

export function reportsRouter(store: Store, cfg: AppConfig): Router {
  const r = Router();
  const auth = requireAuth(cfg, store);
  r.get('/', auth, requirePermission('reports.view'), async (req, res, next) => {
    try {
      const { page, pageSize } = pagination(req.query as Record<string, unknown>);
      const docs = await store.listDocs('reports', { limit: 100000 });
      let items = docs.map(normalizeReport);
      const status = str(req.query.status); if (status) items = items.filter((i) => i.status === status || (status === 'new' && i.status === 'new'));
      const priority = str(req.query.priority); if (priority) items = items.filter((i) => i.priority === priority);
      const q = str(req.query.q).toLowerCase();
      if (q) items = items.filter((i) => [i.description, i.reason, i.id, i.reporterId, i.targetId].some((f) => f.toLowerCase().includes(q)));
      items.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
      res.json({ data: paginate(items, page, pageSize) });
    } catch (e) { next(e); }
  });
  r.get('/:id', auth, requirePermission('reports.view'), async (req, res, next) => {
    try {
      const doc = await store.getDoc(`reports/${req.params.id}`);
      if (!doc) throw new AppError('NOT_FOUND', 'Report not found', 404);
      res.json({ data: normalizeReport(doc) });
    } catch (e) { next(e); }
  });
  r.patch('/:id', auth, requirePermission('reports.manage'), async (req: Request, res, next) => {
    try {
      const body = z.object({
        status: z.string().optional(),
        assignedTo: z.string().nullable().optional(),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
        resolution: z.string().optional(),
      }).parse(req.body);
      const doc = await store.getDoc(`reports/${req.params.id}`);
      if (!doc) throw new AppError('NOT_FOUND', 'Report not found', 404);
      // Write canonical status back ('new' stays 'new'; app 'open' becomes canonical on first admin write)
      const updated = await store.updateDoc(doc.path, { ...body, updatedAt: nowIso() });
      await writeAudit(store, req, 'reports.update', 'report', req.params.id, body.resolution ?? body.status ?? '');
      res.json({ data: normalizeReport(updated) });
    } catch (e) { next(e); }
  });
  r.post('/:id/note', auth, requirePermission('reports.manage'), async (req: Request, res, next) => {
    try {
      const body = z.object({ text: z.string().min(1) }).parse(req.body);
      const doc = await store.getDoc(`reports/${req.params.id}`);
      if (!doc) throw new AppError('NOT_FOUND', 'Report not found', 404);
      const notes = Array.isArray(doc.data.notes) ? [...(doc.data.notes as unknown[])] : [];
      notes.push({ by: req.admin!.id, text: body.text, at: nowIso() });
      const updated = await store.updateDoc(doc.path, { notes, updatedAt: nowIso() });
      await writeAudit(store, req, 'reports.note', 'report', req.params.id);
      res.json({ data: normalizeReport(updated) });
    } catch (e) { next(e); }
  });
  return r;
}

export function appealsRouter(store: Store, cfg: AppConfig, fbAuth: FirebaseAuthService): Router {
  const r = Router();
  const auth = requireAuth(cfg, store);
  r.get('/', auth, requirePermission('appeals.view'), async (req, res, next) => {
    try {
      const { page, pageSize } = pagination(req.query as Record<string, unknown>);
      const docs = await store.listDocs('appeals', { limit: 100000 });
      let items = docs.map(normalizeAppeal);
      const status = str(req.query.status); if (status) items = items.filter((i) => i.status === status);
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      res.json({ data: paginate(items, page, pageSize) });
    } catch (e) { next(e); }
  });
  r.post('/', auth, requirePermission('appeals.view'), async (req: Request, res, next) => {
    try {
      const body = z.object({
        userId: z.string().min(1),
        caseId: z.string().nullable().optional(),
        targetType: z.string().min(1),
        targetId: z.string().min(1),
        originalDecision: z.string().min(1),
        appealReason: z.string().min(1),
      }).parse(req.body);
      const doc = await store.addDoc('appeals', {
        userId: body.userId, caseId: body.caseId ?? null, targetType: body.targetType, targetId: body.targetId,
        originalDecision: body.originalDecision, appealReason: body.appealReason,
        status: 'pending', reviewedBy: null, reviewNote: '', createdAt: nowIso(), updatedAt: nowIso(),
      });
      await writeAudit(store, req, 'appeals.create', 'appeal', doc.id, body.appealReason);
      res.status(201).json({ data: normalizeAppeal(doc) });
    } catch (e) { next(e); }
  });
  r.post('/:id/decide', auth, requirePermission('appeals.decide'), async (req: Request, res, next) => {
    try {
      const body = z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().default('') }).parse(req.body);
      const doc = await store.getDoc(`appeals/${req.params.id}`);
      if (!doc) throw new AppError('NOT_FOUND', 'Appeal not found', 404);
      const appeal = normalizeAppeal(doc);
      if (body.decision === 'approved') {
        // Reverse the linked action.
        if (appeal.targetType === 'user' || appeal.targetType === 'account') {
          await reinstateUser(store, fbAuth, appeal.targetId, req.admin!.id, body.note || 'Appeal approved').catch(() => undefined);
        } else if (['post', 'clip', 'story', 'event'].includes(appeal.targetType)) {
          await applyContentAction(store, appeal.targetType as ContentType, appeal.targetId, 'restore', req.admin!.id, body.note || 'Appeal approved').catch(() => undefined);
        } else if (appeal.targetType === 'comment') {
          const comments = await store.collectionGroup('comments', { limit: 100000 });
          const found = comments.find((x) => x.id === appeal.targetId);
          if (found) {
            const segs = found.path.split('/');
            await applyCommentAction(store, segs[segs.length - 3], appeal.targetId, 'restore', req.admin!.id, body.note || 'Appeal approved').catch(() => undefined);
          }
        }
        // If the appeal is about the appealing user's own account suspension, reinstate them too.
        if (appeal.userId && appeal.userId !== appeal.targetId) {
          const u = await store.getDoc(`users/${appeal.userId}`);
          if (u && u.data.accountStatus === 'suspended') {
            await reinstateUser(store, fbAuth, appeal.userId, req.admin!.id, body.note || 'Appeal approved').catch(() => undefined);
          }
        }
      }
      const updated = await store.updateDoc(doc.path, {
        status: body.decision, reviewedBy: req.admin!.id, reviewNote: body.note, updatedAt: nowIso(),
      });
      await notifyUser(store, appeal.userId, body.decision === 'approved' ? 'Appeal approved' : 'Appeal rejected',
        body.note || `Your appeal was ${body.decision}.`, { kind: 'appeal', appealId: appeal.id, decision: body.decision });
      await writeAudit(store, req, 'appeals.decide', 'appeal', req.params.id, body.note || body.decision);
      res.json({ data: normalizeAppeal(updated) });
    } catch (e) { next(e); }
  });
  return r;
}
