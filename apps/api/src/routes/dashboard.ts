import { Router } from 'express';
import type { Store } from '../db/store.js';
import type { AppConfig } from '../config/env.js';
import { dailySeries, inRange, isoOrNull, paginate, parseRange, pick, str } from '../utils/helpers.js';
import { requireAuth, requirePermission, requireAnyPermission } from '../middleware/auth.js';
import { normalizeContent, normalizeConversation, normalizeReport, normalizeUser } from '../services/normalize.js';
import type { DashboardOverview, MetricValue } from '@atheleos/shared';

const metric = (value: number | null, available = true, note?: string): MetricValue => ({ value, available, ...(note ? { note } : {}) });

export function dashboardRouter(store: Store, cfg: AppConfig): Router {
  const r = Router();
  const auth = requireAuth(cfg, store);

  r.get('/overview', auth, requirePermission('dashboard.view'), async (req, res, next) => {
    try {
      const range = parseRange(req.query as Record<string, unknown>);
      const [users, posts, stories, reports, cases, mail, audits, notifJobs] = await Promise.all([
        store.listDocs('users', { limit: 100000 }),
        store.listDocs('posts', { limit: 100000 }),
        store.listDocs('stories', { limit: 100000 }),
        store.listDocs('reports', { limit: 100000 }),
        store.listDocs('moderation_cases', { limit: 100000 }).catch(() => []),
        store.listDocs('mail', { limit: 100000 }).catch(() => []),
        store.listDocs('admin_audit_logs', { limit: 100000 }).catch(() => []),
        store.listDocs('admin_notification_jobs', { limit: 100000 }).catch(() => []),
      ]);
      let commentsCount: number | null = null; let commentsAvailable = true;
      try {
        const comments = await store.collectionGroup('comments', { limit: 5000 });
        commentsCount = comments.length >= 5000 ? null : comments.length;
        if (commentsCount === null) commentsAvailable = true; // capped: report unavailable count rather than a wrong number
      } catch { commentsAvailable = false; }
      // Capped count is not a real total — mark unavailable per MetricValue semantics.
      if (commentsCount === null) commentsAvailable = false;

      const newUsers = users.filter((u) => inRange(isoOrNull(pick(u.data, ['createdAt', 'joinedAt'], null) as string | null), range));
      const suspended = users.filter((u) => u.data.accountStatus === 'suspended' || u.data.accountStatus === 'restricted');
      const postsCount = posts.filter((p) => str(p.data.type, 'post') !== 'clip').length;
      const clipsCount = posts.filter((p) => str(p.data.type) === 'clip').length;
      const openStatuses = ['open', 'new', 'under_review', 'escalated'];
      const reportsOpen = reports.filter((x) => openStatuses.includes(str(x.data.status, 'open'))).length;
      const pendingCases = cases.filter((c) => ['new', 'under_review', 'escalated'].includes(str(c.data.status, 'new'))).length;
      const delivered = mail.filter((m) => ['SUCCESS', 'success', 'delivered', 'sent', 'sent-via-smtp'].includes(str(((m.data.delivery ?? {}) as Record<string, unknown>).state ?? ((m.data.delivery ?? {}) as Record<string, unknown>).status))).length;
      const withDelivery = mail.filter((m) => m.data.delivery && typeof m.data.delivery === 'object' && Object.keys(m.data.delivery as object).length > 0);
      const failed = mail.filter((m) => ['FAILURE', 'failure', 'failed', 'error'].includes(str(((m.data.delivery ?? {}) as Record<string, unknown>).state ?? ((m.data.delivery ?? {}) as Record<string, unknown>).status))).length;
      const notifSent = notifJobs.reduce((acc, j) => acc + (Number(j.data.sentCount ?? 0) || 0), 0);

      // Active users from sessions subcollection when present.
      let activeMetric: MetricValue;
      try {
        const sessions = await store.collectionGroup('sessions', { limit: 100000 });
        if (!sessions.length) activeMetric = metric(null, false, 'No session activity data in users/{uid}/sessions');
        else {
          const activeIds = new Set<string>();
          for (const s of sessions) {
            const last = isoOrNull(pick(s.data, ['lastActive', 'lastActiveAt', 'updatedAt'], null) as string | null);
            if (last && inRange(last, range)) {
              const segs = s.path.split('/');
              if (segs.length >= 2) activeIds.add(segs[segs.length - 3] ?? s.id);
            }
          }
          activeMetric = metric(activeIds.size, true);
        }
      } catch { activeMetric = metric(null, false, 'Session data unavailable'); }

      const overview: DashboardOverview = {
        range: range.label,
        totals: {
          users: metric(users.length),
          newUsers: metric(newUsers.length),
          activeUsers: activeMetric,
          suspendedUsers: metric(suspended.length),
          posts: metric(postsCount),
          clips: metric(clipsCount),
          stories: metric(stories.length),
          comments: metric(commentsCount, commentsAvailable, commentsAvailable ? undefined : 'Comment count capped/unavailable'),
          reportsOpen: metric(reportsOpen),
          moderationPending: metric(pendingCases),
          supportOpen: metric(reportsOpen),
          emailsQueued: metric(mail.length - withDelivery.length >= 0 ? mail.length - withDelivery.length : mail.length),
          emailsDelivered: withDelivery.length ? metric(delivered) : metric(null, false, 'No delivery data written by the mail extension yet'),
          emailsFailed: withDelivery.length ? metric(failed) : metric(null, false, 'No delivery data written by the mail extension yet'),
          notificationsSent: metric(notifSent),
        },
        series: {
          registrations: dailySeries(users.map((u) => isoOrNull(pick(u.data, ['createdAt', 'joinedAt'], null) as string | null)), range),
          content: dailySeries([...posts, ...stories].map((p) => isoOrNull(pick(p.data, ['createdAt', 'timestamp'], null) as string | null)), range),
          reports: dailySeries(reports.map((x) => isoOrNull(pick(x.data, ['createdAt', 'timestamp'], null) as string | null)), range),
        },
        recentActions: [...audits]
          .sort((a, b) => str(b.data.createdAt).localeCompare(str(a.data.createdAt)))
          .slice(0, 10)
          .map((a) => ({
            id: a.id, adminId: str(a.data.adminId), adminEmail: str(a.data.adminEmail), action: str(a.data.action),
            resourceType: str(a.data.resourceType), resourceId: str(a.data.resourceId), reason: str(a.data.reason),
            outcome: (str(a.data.outcome, 'success') === 'failure' ? 'failure' : 'success') as 'success' | 'failure',
            correlationId: str(a.data.correlationId), createdAt: str(a.data.createdAt),
          })),
        health: {
          firestore: await store.ping(),
          email: cfg.smtpConfigured || cfg.imapConfigured,
          messaging: true, // chats collection is part of the same Firestore backend
        },
      };
      res.json({ data: overview });
    } catch (e) { next(e); }
  });
  return r;
}

export function searchRouter(store: Store, cfg: AppConfig): Router {
  const r = Router();
  const auth = requireAuth(cfg, store);
  r.get('/', auth, requireAnyPermission('users.view', 'content.view', 'reports.view', 'messages.view', 'support.view'), async (req, res, next) => {
    try {
      const q = str(req.query.q).toLowerCase();
      const type = str(req.query.type);
      const perms = req.admin!.permissions;
      const out: Record<string, unknown[]> = {};
      if (!q) return res.json({ data: out });
      const want = (t: string) => !type || type === t;
      if (want('users') && perms.includes('users.view')) {
        const docs = await store.listDocs('users', { limit: 100000 });
        const canContact = perms.includes('users.view_contact');
        out.users = docs.map((d) => normalizeUser(d, canContact))
          .filter((u) => [u.username, u.displayName, u.email ?? '', u.id].some((f) => f.toLowerCase().includes(q))).slice(0, 10);
      }
      if (want('content') && perms.includes('content.view')) {
        const [posts, stories] = await Promise.all([store.listDocs('posts', { limit: 100000 }), store.listDocs('stories', { limit: 100000 })]);
        out.content = [...posts.map((d) => normalizeContent(d)), ...stories.map((d) => normalizeContent(d, 'story'))]
          .filter((c) => [c.caption, c.id, c.authorName].some((f) => f.toLowerCase().includes(q))).slice(0, 10);
      }
      if ((want('reports') && perms.includes('reports.view')) || (want('tickets') && perms.includes('support.view'))) {
        const docs = await store.listDocs('reports', { limit: 100000 });
        const filtered = docs.map(normalizeReport).filter((x) => [x.description, x.reason, x.id].some((f) => f.toLowerCase().includes(q))).slice(0, 10);
        if (perms.includes('reports.view')) out.reports = filtered;
        if (perms.includes('support.view')) out.tickets = filtered;
      }
      if (want('conversations') && perms.includes('messages.view')) {
        const docs = await store.listDocs('chats', { limit: 100000 });
        out.conversations = docs.map(normalizeConversation)
          .filter((c) => [c.name, c.id, ...c.participantIds].some((f) => f.toLowerCase().includes(q))).slice(0, 10);
      }
      if (want('emails') && perms.includes('email.view')) {
        const docs = await store.listDocs('mail', { limit: 100000 });
        out.emails = docs.filter((d) => JSON.stringify(d.data).toLowerCase().includes(q)).slice(0, 10)
          .map((d) => ({ id: d.id, to: d.data.to ?? null, subject: str(((d.data.message ?? {}) as Record<string, unknown>).subject), createdAt: (d.data.createdAt as string | null) ?? null }));
      }
      res.json({ data: out });
    } catch (e) { next(e); }
  });
  return r;
}

export { paginate as _paginateUnused };
