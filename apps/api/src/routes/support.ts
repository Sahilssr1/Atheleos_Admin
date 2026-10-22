import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Store } from '../db/store.js';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { nowIso, paginate, pagination, str } from '../utils/helpers.js';
import { requireAuth, requirePermission, writeAudit } from '../middleware/auth.js';
import { normalizeReport, rawEmail } from '../services/normalize.js';
import { notifyUser } from '../services/userService.js';

// Support tickets are a view over `reports` (the app's Report a Problem flow).
export function supportRouter(store: Store, cfg: AppConfig): Router {
  const r = Router();
  const auth = requireAuth(cfg, store);

  r.get('/tickets', auth, requirePermission('support.view'), async (req, res, next) => {
    try {
      const { page, pageSize } = pagination(req.query as Record<string, unknown>);
      const docs = await store.listDocs('reports', { limit: 100000 });
      let items = docs.map(normalizeReport);
      const status = str(req.query.status); if (status) items = items.filter((i) => i.status === status);
      const q = str(req.query.q).toLowerCase();
      if (q) items = items.filter((i) => [i.description, i.reason, i.id, i.reporterId].some((f) => f.toLowerCase().includes(q)));
      items.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
      res.json({ data: paginate(items, page, pageSize) });
    } catch (e) { next(e); }
  });

  r.get('/tickets/:id', auth, requirePermission('support.view'), async (req, res, next) => {
    try {
      const doc = await store.getDoc(`reports/${req.params.id}`);
      if (!doc) throw new AppError('NOT_FOUND', 'Ticket not found', 404);
      const replies = Array.isArray(doc.data.replies) ? doc.data.replies : [];
      const notes = Array.isArray(doc.data.notes) ? doc.data.notes : [];
      res.json({ data: { ticket: normalizeReport(doc), replies, notes } });
    } catch (e) { next(e); }
  });

  r.post('/tickets/:id/reply', auth, requirePermission('support.reply'), async (req: Request, res, next) => {
    try {
      const body = z.object({ message: z.string().min(1), via: z.enum(['inapp', 'email', 'both']).default('inapp') }).parse(req.body);
      const doc = await store.getDoc(`reports/${req.params.id}`);
      if (!doc) throw new AppError('NOT_FOUND', 'Ticket not found', 404);
      const ticket = normalizeReport(doc);
      const reporterId = ticket.reporterId;
      const sentVia: string[] = [];
      if ((body.via === 'inapp' || body.via === 'both') && reporterId) {
        await notifyUser(store, reporterId, 'Support reply', body.message, { kind: 'support_reply', ticketId: req.params.id });
        sentVia.push('inapp');
      }
      if ((body.via === 'email' || body.via === 'both') && reporterId) {
        const userDoc = await store.getDoc(`users/${reporterId}`);
        const email = userDoc ? rawEmail(userDoc.data) : null;
        if (email) {
          await store.addDoc('mail', {
            to: email, message: { subject: `Re: Your support request (${req.params.id})`, html: `<p>${body.message}</p>` },
            createdAt: nowIso(), source: 'admin-support', data: { ticketId: req.params.id },
          });
          sentVia.push('email');
        }
      }
      const replies = Array.isArray(doc.data.replies) ? [...(doc.data.replies as unknown[])] : [];
      replies.push({ by: req.admin!.id, message: body.message, via: body.via, sentVia, at: nowIso() });
      await store.updateDoc(doc.path, { replies, updatedAt: nowIso() });
      await writeAudit(store, req, 'support.reply', 'ticket', req.params.id, body.via);
      res.json({ data: { ok: true, sentVia } });
    } catch (e) { next(e); }
  });

  r.patch('/tickets/:id', auth, requirePermission('support.reply'), async (req: Request, res, next) => {
    try {
      const body = z.object({
        status: z.string().optional(),
        assignedTo: z.string().nullable().optional(),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
      }).parse(req.body);
      const doc = await store.getDoc(`reports/${req.params.id}`);
      if (!doc) throw new AppError('NOT_FOUND', 'Ticket not found', 404);
      const updated = await store.updateDoc(doc.path, { ...body, updatedAt: nowIso() });
      await writeAudit(store, req, 'support.update', 'ticket', req.params.id, body.status ?? '');
      res.json({ data: normalizeReport(updated) });
    } catch (e) { next(e); }
  });
  return r;
}
