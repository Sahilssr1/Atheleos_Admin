import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Store } from '../db/store.js';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { nowIso, paginate, pagination, str } from '../utils/helpers.js';
import { requireAuth, requirePermission, writeAudit } from '../middleware/auth.js';
import { smtpTransport, withImap } from '../services/emailService.js';

function mailDocView(doc: { id: string; data: Record<string, unknown> }) {
  const d = doc.data;
  const message = (d.message ?? {}) as Record<string, unknown>;
  const delivery = (d.delivery ?? {}) as Record<string, unknown>;
  return {
    id: doc.id,
    to: d.to ?? null,
    subject: str(message.subject ?? d.subject),
    status: str(delivery.state ?? delivery.status ?? d.status, 'queued'),
    delivery,
    createdAt: (d.createdAt as string | null) ?? null,
    source: str(d.source),
  };
}

export function emailRouter(store: Store, cfg: AppConfig): Router {
  const r = Router();
  const auth = requireAuth(cfg, store);

  r.get('/status', auth, requirePermission('email.view'), async (req, res, next) => {
    try {
      const queue = await store.listDocs('mail', { limit: 100000 }).catch(() => []);
      res.json({ data: { smtpConfigured: cfg.smtpConfigured, imapConfigured: cfg.imapConfigured, from: cfg.SMTP_FROM, queueCount: queue.length } });
    } catch (e) { next(e); }
  });

  r.get('/inbox', auth, requirePermission('email.view'), async (req, res, next) => {
    try {
      if (!cfg.imapConfigured) throw new AppError('EMAIL_NOT_CONFIGURED', 'IMAP is not configured on the server', 503);
      const { page, pageSize } = pagination(req.query as Record<string, unknown>);
      const folder = str(req.query.folder, 'INBOX') || 'INBOX';
      const result = await withImap(cfg, async (client) => {
        const lock = await client.getMailboxLock(folder);
        try {
          const total = client.mailbox?.exists ?? 0;
          const items: Record<string, unknown>[] = [];
          if (total > 0) {
            const end = total - (page - 1) * pageSize;
            const start = Math.max(1, end - pageSize + 1);
            if (end >= 1) {
              for await (const msg of client.fetch(`${start}:${end}`, { uid: true, envelope: true, flags: true })) {
                const env = msg.envelope ?? {};
                items.push({
                  uid: msg.uid, subject: env.subject ?? '', date: env.date ? new Date(env.date).toISOString() : null,
                  from: (env.from ?? []).map((a: { name?: string; address?: string }) => ({ name: a.name ?? '', address: a.address ?? '' })),
                  to: (env.to ?? []).map((a: { name?: string; address?: string }) => ({ name: a.name ?? '', address: a.address ?? '' })),
                  seen: Array.isArray(msg.flags) ? msg.flags.includes('\\Seen') : false,
                });
              }
            }
          }
          items.reverse();
          return { items, page, pageSize, total };
        } finally { lock.release(); }
      });
      res.json({ data: result });
    } catch (e) { next(e); }
  });

  r.get('/inbox/:uid', auth, requirePermission('email.view'), async (req, res, next) => {
    try {
      if (!cfg.imapConfigured) throw new AppError('EMAIL_NOT_CONFIGURED', 'IMAP is not configured on the server', 503);
      const folder = str(req.query.folder, 'INBOX') || 'INBOX';
      const data = await withImap(cfg, async (client) => {
        const lock = await client.getMailboxLock(folder);
        try {
          const msg = await client.fetchOne(req.params.uid, { uid: true, envelope: true, source: true }, { uid: true });
          if (!msg) return null;
          const env = msg.envelope ?? {};
          let body = '';
          if (msg.source) {
            const raw = Buffer.isBuffer(msg.source) ? msg.source.toString('utf8') : String(msg.source);
            const idx = raw.indexOf('\r\n\r\n');
            body = idx >= 0 ? raw.slice(idx + 4) : raw;
          }
          return {
            uid: msg.uid, subject: env.subject ?? '', date: env.date ? new Date(env.date).toISOString() : null,
            from: (env.from ?? []).map((a: { name?: string; address?: string }) => ({ name: a.name ?? '', address: a.address ?? '' })),
            to: (env.to ?? []).map((a: { name?: string; address?: string }) => ({ name: a.name ?? '', address: a.address ?? '' })),
            body,
          };
        } finally { lock.release(); }
      });
      if (!data) throw new AppError('NOT_FOUND', 'Email message not found', 404);
      res.json({ data });
    } catch (e) { next(e); }
  });

  r.get('/queue', auth, requirePermission('email.view'), async (req, res, next) => {
    try {
      const { page, pageSize } = pagination(req.query as Record<string, unknown>);
      const docs = await store.listDocs('mail', { limit: 100000 });
      const items = docs.map(mailDocView).sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
      res.json({ data: paginate(items, page, pageSize) });
    } catch (e) { next(e); }
  });

  r.get('/drafts', auth, requirePermission('email.view'), async (req, res, next) => {
    try {
      const { page, pageSize } = pagination(req.query as Record<string, unknown>);
      const docs = await store.listDocs('admin_email_drafts', { limit: 100000 });
      const mine = docs.filter((d) => !req.query.mine || d.data.adminId === req.admin!.id);
      const items = mine.map((d) => ({ id: d.id, ...d.data })).sort((a, b) => String((b as Record<string, unknown>).updatedAt ?? '').localeCompare(String((a as Record<string, unknown>).updatedAt ?? '')));
      res.json({ data: paginate(items, page, pageSize) });
    } catch (e) { next(e); }
  });

  r.post('/drafts', auth, requirePermission('email.view'), async (req: Request, res, next) => {
    try {
      const body = z.object({
        id: z.string().optional(),
        to: z.array(z.string()).optional().default([]),
        cc: z.array(z.string()).optional().default([]),
        bcc: z.array(z.string()).optional().default([]),
        subject: z.string().optional().default(''),
        html: z.string().optional().default(''),
      }).parse(req.body);
      if (body.id) {
        const existing = await store.getDoc(`admin_email_drafts/${body.id}`);
        if (!existing) throw new AppError('NOT_FOUND', 'Draft not found', 404);
        const updated = await store.updateDoc(existing.path, { to: body.to, cc: body.cc, bcc: body.bcc, subject: body.subject, html: body.html, updatedAt: nowIso() });
        return res.json({ data: { id: updated.id, ...updated.data } });
      }
      const doc = await store.addDoc('admin_email_drafts', {
        to: body.to, cc: body.cc, bcc: body.bcc, subject: body.subject, html: body.html,
        adminId: req.admin!.id, createdAt: nowIso(), updatedAt: nowIso(),
      });
      res.status(201).json({ data: { id: doc.id, ...doc.data } });
    } catch (e) { next(e); }
  });

  r.delete('/drafts/:id', auth, requirePermission('email.view'), async (req, res, next) => {
    try {
      const doc = await store.getDoc(`admin_email_drafts/${req.params.id}`);
      if (!doc) throw new AppError('NOT_FOUND', 'Draft not found', 404);
      await store.deleteDoc(doc.path);
      res.json({ data: { ok: true } });
    } catch (e) { next(e); }
  });

  const sendSchema = z.object({
    to: z.array(z.string().email()).min(1),
    cc: z.array(z.string().email()).optional().default([]),
    bcc: z.array(z.string().email()).optional().default([]),
    subject: z.string().min(1),
    html: z.string().min(1),
    draftId: z.string().optional(),
    inReplyTo: z.string().optional(),
    references: z.string().optional(),
  });

  async function doSend(req: Request, res: import('express').Response, next: import('express').NextFunction) {
    try {
      const body = sendSchema.parse(req.body);
      let via: 'smtp' | 'queue' = 'queue';
      let id = '';
      if (cfg.smtpConfigured) {
        try {
          const info = await smtpTransport(cfg).sendMail({
            from: cfg.SMTP_FROM, to: body.to, cc: body.cc.length ? body.cc : undefined,
            bcc: body.bcc.length ? body.bcc : undefined, subject: body.subject, html: body.html,
            inReplyTo: body.inReplyTo, references: body.references,
          });
          via = 'smtp'; id = String(info.messageId ?? '');
          // Record the send in the mail collection for a unified audit/queue view.
          await store.addDoc('mail', {
            to: body.to, cc: body.cc, bcc: body.bcc,
            message: { subject: body.subject, html: body.html },
            delivery: { state: 'sent-via-smtp', messageId: id }, createdAt: nowIso(), source: 'admin-email', sentBy: req.admin!.id,
          }).catch(() => undefined);
        } catch (err) {
          // Real SMTP failure (e.g. unreachable) — surface it, do not fake success.
          throw new AppError('EMAIL_SEND_FAILED', `SMTP send failed: ${err instanceof Error ? err.message : 'unknown error'}`, 502);
        }
      } else {
        const doc = await store.addDoc('mail', {
          to: body.to.length === 1 ? body.to[0] : body.to, cc: body.cc, bcc: body.bcc,
          message: { subject: body.subject, html: body.html },
          createdAt: nowIso(), source: 'admin-email', sentBy: req.admin!.id,
        });
        via = 'queue'; id = doc.id;
      }
      if (body.draftId) {
        const draft = await store.getDoc(`admin_email_drafts/${body.draftId}`);
        if (draft) await store.deleteDoc(draft.path).catch(() => undefined);
      }
      await writeAudit(store, req, 'email.send', 'email', id, body.subject);
      res.json({ data: { via, id } });
    } catch (e) { next(e); }
  }

  r.post('/send', auth, requirePermission('email.send'), doSend);
  // Reply/forward are compose modes over the same send pipeline (per contract).
  r.post('/reply', auth, requirePermission('email.send'), doSend);
  r.post('/forward', auth, requirePermission('email.send'), doSend);
  return r;
}
