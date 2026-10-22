import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Store } from '../db/store.js';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { paginate, pagination, str } from '../utils/helpers.js';
import { requireAuth, requirePermission, writeAudit } from '../middleware/auth.js';
import { normalizeComment, normalizeContent } from '../services/normalize.js';
import { applyCommentAction, applyContentAction, collectionForType } from '../services/contentService.js';
import type { ContentType } from '@atheleos/shared';

const TYPES: ContentType[] = ['post', 'clip', 'story', 'event'];
function parseType(v: string): ContentType {
  if ((TYPES as string[]).includes(v)) return v as ContentType;
  throw new AppError('VALIDATION_ERROR', `Unknown content type: ${v}`, 400);
}

export function contentRouter(store: Store, cfg: AppConfig): Router {
  const r = Router();
  const auth = requireAuth(cfg, store);

  r.get('/', auth, requirePermission('content.view'), async (req, res, next) => {
    try {
      const { page, pageSize } = pagination(req.query as Record<string, unknown>);
      const typeFilter = str(req.query.type);
      let items: ReturnType<typeof normalizeContent>[] = [];
      if (!typeFilter || typeFilter === 'post' || typeFilter === 'clip') {
        const docs = await store.listDocs('posts', { limit: 100000 });
        items.push(...docs.map((d) => normalizeContent(d)));
      }
      if (!typeFilter || typeFilter === 'story') {
        const docs = await store.listDocs('stories', { limit: 100000 });
        items.push(...docs.map((d) => normalizeContent(d, 'story')));
      }
      if (!typeFilter || typeFilter === 'event') {
        const docs = await store.listDocs('events', { limit: 100000 });
        items.push(...docs.map((d) => normalizeContent(d, 'event')));
      }
      if (typeFilter) items = items.filter((i) => i.type === typeFilter);
      const status = str(req.query.status);
      if (status) items = items.filter((i) => i.status === status);
      const q = str(req.query.q).toLowerCase();
      if (q) items = items.filter((i) => [i.caption, i.authorName, i.authorId, i.id].some((f) => f.toLowerCase().includes(q)));
      items.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
      res.json({ data: paginate(items, page, pageSize) });
    } catch (e) { next(e); }
  });

  r.post('/bulk', auth, requirePermission('content.moderate'), async (req: Request, res, next) => {
    try {
      const body = z.object({
        type: z.enum(['post', 'clip', 'story', 'event']),
        ids: z.array(z.string().min(1)).min(1).max(50),
        action: z.enum(['hide', 'restore', 'remove']),
        reason: z.string().min(1),
      }).parse(req.body);
      const results: { id: string; ok: boolean; error?: string }[] = [];
      for (const id of body.ids) {
        try { await applyContentAction(store, body.type, id, body.action, req.admin!.id, body.reason); results.push({ id, ok: true }); }
        catch (e) { results.push({ id, ok: false, error: e instanceof Error ? e.message : 'failed' }); }
      }
      await writeAudit(store, req, `content.bulk_${body.action}`, 'content', body.ids.join(','), body.reason);
      res.json({ data: { results } });
    } catch (e) { next(e); }
  });

  r.get('/:type/:id', auth, requirePermission('content.view'), async (req, res, next) => {
    try {
      const type = parseType(req.params.type);
      const coll = collectionForType(type);
      const doc = await store.getDoc(`${coll}/${req.params.id}`);
      if (!doc) throw new AppError('NOT_FOUND', 'Content not found', 404);
      const item = normalizeContent(doc, type);
      if ((type === 'post' || type === 'clip') && doc.data.type && String(doc.data.type) !== type) throw new AppError('NOT_FOUND', 'Content not found', 404);
      res.json({ data: item });
    } catch (e) { next(e); }
  });

  for (const action of ['hide', 'restore', 'remove'] as const) {
    r.post(`/:type/:id/${action}`, auth, requirePermission('content.moderate'), async (req: Request, res, next) => {
      try {
        const type = parseType(req.params.type);
        const body = z.object({ reason: z.string().min(1) }).parse(req.body);
        await applyContentAction(store, type, req.params.id, action, req.admin!.id, body.reason);
        await writeAudit(store, req, `content.${action}`, 'content', req.params.id, body.reason);
        res.json({ data: { ok: true } });
      } catch (e) { next(e); }
    });
  }
  return r;
}

export function commentsRouter(store: Store, cfg: AppConfig): Router {
  const r = Router();
  const auth = requireAuth(cfg, store);
  r.get('/', auth, requirePermission('content.view'), async (req, res, next) => {
    try {
      const { page, pageSize } = pagination(req.query as Record<string, unknown>);
      const docs = await store.collectionGroup('comments', { limit: 100000 });
      let items = docs.map(normalizeComment);
      const postId = str(req.query.postId);
      if (postId) items = items.filter((i) => i.postId === postId);
      const q = str(req.query.q).toLowerCase();
      if (q) items = items.filter((i) => [i.text, i.authorName, i.authorId, i.id].some((f) => f.toLowerCase().includes(q)));
      const status = str(req.query.status);
      if (status) items = items.filter((i) => i.status === status);
      items.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
      res.json({ data: paginate(items, page, pageSize) });
    } catch (e) { next(e); }
  });
  for (const action of ['hide', 'restore', 'remove'] as const) {
    r.post(`/:postId/:commentId/${action}`, auth, requirePermission('comments.moderate'), async (req: Request, res, next) => {
      try {
        const body = z.object({ reason: z.string().min(1) }).parse(req.body);
        await applyCommentAction(store, req.params.postId, req.params.commentId, action, req.admin!.id, body.reason);
        await writeAudit(store, req, `comments.${action}`, 'comment', req.params.commentId, body.reason);
        res.json({ data: { ok: true } });
      } catch (e) { next(e); }
    });
  }
  return r;
}
