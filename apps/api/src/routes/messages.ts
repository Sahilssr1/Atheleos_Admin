import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Store } from '../db/store.js';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { nowIso, paginate, pagination, str } from '../utils/helpers.js';
import { requireAuth, requirePermission, writeAudit } from '../middleware/auth.js';
import { normalizeChatMessage, normalizeConversation } from '../services/normalize.js';

export function messagesRouter(store: Store, cfg: AppConfig): Router {
  const r = Router();
  const auth = requireAuth(cfg, store);

  r.get('/conversations', auth, requirePermission('messages.view'), async (req, res, next) => {
    try {
      const { page, pageSize } = pagination(req.query as Record<string, unknown>);
      const docs = await store.listDocs('chats', { limit: 100000 });
      let items = docs.map(normalizeConversation);
      const q = str(req.query.q).toLowerCase();
      if (q) items = items.filter((i) => [i.name, i.id, i.lastMessage, ...i.participantIds].some((f) => f.toLowerCase().includes(q)));
      items.sort((a, b) => String(b.lastMessageAt ?? '').localeCompare(String(a.lastMessageAt ?? '')));
      res.json({ data: paginate(items, page, pageSize) });
    } catch (e) { next(e); }
  });

  r.get('/conversations/:id', auth, requirePermission('messages.view'), async (req: Request, res, next) => {
    try {
      const { page, pageSize } = pagination(req.query as Record<string, unknown>);
      const conv = await store.getDoc(`chats/${req.params.id}`);
      if (!conv) throw new AppError('NOT_FOUND', 'Conversation not found', 404);
      const msgs = await store.listDocs(`chats/${req.params.id}/messages`, { limit: 100000 });
      let items = msgs.map(normalizeChatMessage);
      items.sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
      // Every read of a private conversation is audited.
      await writeAudit(store, req, 'messages.conversation_viewed', 'conversation', req.params.id);
      res.json({ data: { conversation: normalizeConversation(conv), messages: paginate(items, page, pageSize) } });
    } catch (e) { next(e); }
  });

  r.post('/conversations/:id/send', auth, requirePermission('messages.send'), async (req: Request, res, next) => {
    try {
      const body = z.object({ content: z.string().min(1) }).parse(req.body);
      const conv = await store.getDoc(`chats/${req.params.id}`);
      if (!conv) throw new AppError('NOT_FOUND', 'Conversation not found', 404);
      const msg = await store.addDoc(`chats/${req.params.id}/messages`, {
        senderId: `admin:${req.admin!.id}`,
        content: body.content,
        text: body.content,
        type: 'text',
        isAdminMessage: true,
        state: 'sent',
        createdAt: nowIso(),
      });
      await store.updateDoc(`chats/${req.params.id}`, { lastMessage: body.content, lastMessageText: body.content, lastMessageAt: nowIso(), updatedAt: nowIso() }).catch(() => undefined);
      await writeAudit(store, req, 'messages.send', 'conversation', req.params.id);
      res.status(201).json({ data: normalizeChatMessage(msg) });
    } catch (e) { next(e); }
  });

  r.post('/conversations/:id/note', auth, requirePermission('messages.view'), async (req: Request, res, next) => {
    try {
      const body = z.object({ text: z.string().min(1) }).parse(req.body);
      const conv = await store.getDoc(`chats/${req.params.id}`);
      if (!conv) throw new AppError('NOT_FOUND', 'Conversation not found', 404);
      const c = await store.addDoc('moderation_cases', {
        reportId: null, targetType: 'message', targetId: req.params.id, targetAuthorId: '',
        reason: 'Admin note on conversation', evidence: [], status: 'new', priority: 'normal',
        assignedTo: req.admin!.id, decision: null, decisionReason: null, decidedBy: null,
        notes: [{ by: req.admin!.id, text: body.text, at: nowIso() }], createdAt: nowIso(), updatedAt: nowIso(),
      });
      await writeAudit(store, req, 'messages.note', 'conversation', req.params.id);
      res.status(201).json({ data: { ok: true, caseId: c.id } });
    } catch (e) { next(e); }
  });
  return r;
}
