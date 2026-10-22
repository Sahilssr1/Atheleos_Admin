import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Store } from '../db/store.js';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { nowIso, paginate, pagination, str } from '../utils/helpers.js';
import { requireAuth, requirePermission, writeAudit } from '../middleware/auth.js';
import { rawEmail } from '../services/normalize.js';

const audienceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('role'), role: z.string().min(1) }),
  z.object({ kind: z.literal('user'), userId: z.string().min(1) }),
  z.object({ kind: z.literal('sport'), sport: z.string().min(1) }),
]);
type Audience = z.infer<typeof audienceSchema>;

async function resolveAudience(store: Store, audience: Audience) {
  if (audience.kind === 'user') {
    const doc = await store.getDoc(`users/${audience.userId}`);
    return doc ? [doc] : [];
  }
  const all = await store.listDocs('users', { limit: 100000 });
  const active = all.filter((u) => u.data.accountStatus !== 'deleted' && u.data.isDeleted !== true);
  if (audience.kind === 'all') return active;
  if (audience.kind === 'role') return active.filter((u) => str(u.data.role).toLowerCase() === audience.role.toLowerCase());
  if (audience.kind === 'sport') return active.filter((u) => str(u.data.sport ?? u.data.primarySport).toLowerCase() === audience.sport.toLowerCase());
  return [];
}

export function notificationsRouter(store: Store, cfg: AppConfig): Router {
  const r = Router();
  const auth = requireAuth(cfg, store);

  r.get('/jobs', auth, requirePermission('notifications.view'), async (req, res, next) => {
    try {
      const { page, pageSize } = pagination(req.query as Record<string, unknown>);
      const docs = await store.listDocs('admin_notification_jobs', { limit: 100000 });
      const items = docs.map((d) => ({ id: d.id, ...d.data })).sort((a, b) => String((b as Record<string, unknown>).createdAt ?? '').localeCompare(String((a as Record<string, unknown>).createdAt ?? '')));
      res.json({ data: paginate(items, page, pageSize) });
    } catch (e) { next(e); }
  });

  r.post('/preview', auth, requirePermission('notifications.send'), async (req, res, next) => {
    try {
      const body = z.object({ audience: audienceSchema }).parse(req.body);
      const targets = await resolveAudience(store, body.audience);
      res.json({ data: { count: targets.length } });
    } catch (e) { next(e); }
  });

  r.post('/send', auth, requirePermission('notifications.send'), async (req: Request, res, next) => {
    try {
      const body = z.object({
        title: z.string().min(1),
        body: z.string().min(1),
        audience: audienceSchema,
        alsoEmail: z.boolean().optional().default(false),
        dedupeKey: z.string().optional(),
      }).parse(req.body);
      if (body.dedupeKey) {
        const jobs = await store.listDocs('admin_notification_jobs', { where: [{ field: 'dedupeKey', op: '==', value: body.dedupeKey }], limit: 100 });
        const cutoff = Date.now() - 24 * 3600 * 1000;
        const dup = jobs.find((j) => new Date(str(j.data.createdAt)).getTime() >= cutoff);
        if (dup) throw new AppError('DUPLICATE_NOTIFICATION', 'A notification with this dedupeKey was already sent within 24 hours', 409);
      }
      const targets = await resolveAudience(store, body.audience);
      const job = await store.addDoc('admin_notification_jobs', {
        title: body.title, body: body.body, audience: body.audience, alsoEmail: body.alsoEmail,
        dedupeKey: body.dedupeKey ?? null, sentCount: 0, emailCount: 0,
        adminId: req.admin!.id, status: 'sending', createdAt: nowIso(),
      });
      let sent = 0; let emailed = 0;
      // Batched writes (≤500 per batch semantics; sequential per batch here).
      for (let i = 0; i < targets.length; i += 500) {
        const batch = targets.slice(i, i + 500);
        for (const u of batch) {
          await store.addDoc(`users/${u.id}/notifications`, {
            type: 'system', title: body.title, body: body.body, read: false,
            createdAt: nowIso(), senderId: 'admin', data: { adminJobId: job.id },
          });
          sent += 1;
          if (body.alsoEmail) {
            const email = rawEmail(u.data);
            if (email) {
              await store.addDoc('mail', {
                to: email, message: { subject: body.title, html: `<p>${body.body}</p>` },
                createdAt: nowIso(), source: 'admin-notification', data: { adminJobId: job.id },
              });
              emailed += 1;
            }
          }
        }
      }
      await store.updateDoc(job.path, { sentCount: sent, emailCount: emailed, status: 'sent', updatedAt: nowIso() });
      await writeAudit(store, req, 'notifications.send', 'notification_job', job.id, `${body.title} → ${sent} users`);
      res.status(201).json({ data: { id: job.id, sentCount: sent, emailCount: emailed } });
    } catch (e) { next(e); }
  });
  return r;
}
