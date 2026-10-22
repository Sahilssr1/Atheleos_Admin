import { Router } from 'express';
import type { Store } from '../db/store.js';
import type { AppConfig } from '../config/env.js';
import { inRange, isoOrNull, parseRange, pick, str } from '../utils/helpers.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import type { MetricValue } from '@atheleos/shared';

const metric = (value: number | null, available = true, note?: string): MetricValue => ({ value, available, ...(note ? { note } : {}) });
function groupCount(docs: { data: Record<string, unknown> }[], keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of docs) {
    const k = str(pick(d.data, keys, '(unknown)'), '(unknown)') || '(unknown)';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Breakdowns are returned as sorted [{label, count}] arrays — the shape the web charts consume. */
function labeled(rec: Record<string, number>): { label: string; count: number }[] {
  return Object.entries(rec).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

export function analyticsRouter(store: Store, cfg: AppConfig): Router {
  const r = Router();
  const auth = requireAuth(cfg, store);
  r.get('/', auth, requirePermission('analytics.view'), async (req, res, next) => {
    try {
      const range = parseRange(req.query as Record<string, unknown>);
      const [users, posts, stories, events, reports, mail, audits] = await Promise.all([
        store.listDocs('users', { limit: 100000 }),
        store.listDocs('posts', { limit: 100000 }),
        store.listDocs('stories', { limit: 100000 }),
        store.listDocs('events', { limit: 100000 }).catch(() => []),
        store.listDocs('reports', { limit: 100000 }),
        store.listDocs('mail', { limit: 100000 }).catch(() => []),
        store.listDocs('admin_audit_logs', { limit: 100000 }).catch(() => []),
      ]);
      const usersInRange = users.filter((u) => inRange(isoOrNull(pick(u.data, ['createdAt', 'joinedAt'], null) as string | null), range));

      // Report resolution times: closed/action_taken reports with created+updated.
      const resolved = reports.filter((x) => ['closed', 'action_taken', 'resolved', 'dismissed'].includes(str(x.data.status)) && x.data.createdAt && x.data.updatedAt);
      let resolutionMetric: MetricValue;
      if (!resolved.length) resolutionMetric = metric(null, false, 'No resolved reports with timestamps in the data');
      else {
        const hours = resolved.map((x) => (new Date(str(x.data.updatedAt)).getTime() - new Date(str(x.data.createdAt)).getTime()) / 3600000).filter((h) => Number.isFinite(h) && h >= 0);
        resolutionMetric = hours.length ? metric(Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 100) / 100) : metric(null, false, 'Resolution timestamps invalid');
      }
      // Support response times: reports carrying replies[].
      const withReplies = reports.filter((x) => Array.isArray(x.data.replies) && (x.data.replies as unknown[]).length > 0 && x.data.createdAt);
      let supportMetric: MetricValue;
      if (!withReplies.length) supportMetric = metric(null, false, 'No support replies recorded yet');
      else {
        const hours = withReplies.map((x) => {
          const first = (x.data.replies as { at: string }[])[0];
          return (new Date(first.at).getTime() - new Date(str(x.data.createdAt)).getTime()) / 3600000;
        }).filter((h) => Number.isFinite(h) && h >= 0);
        supportMetric = hours.length ? metric(Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 100) / 100) : metric(null, false);
      }
      const withDelivery = mail.filter((m) => m.data.delivery && typeof m.data.delivery === 'object' && Object.keys(m.data.delivery as object).length > 0);
      const stateOf = (m: { data: Record<string, unknown> }) => str(((m.data.delivery ?? {}) as Record<string, unknown>).state ?? ((m.data.delivery ?? {}) as Record<string, unknown>).status);
      const emailOutcomes = withDelivery.length
        ? { available: true as const, delivered: withDelivery.filter((m) => ['SUCCESS', 'success', 'delivered', 'sent', 'sent-via-smtp'].includes(stateOf(m))).length, failed: withDelivery.filter((m) => ['FAILURE', 'failure', 'failed', 'error'].includes(stateOf(m))).length, total: withDelivery.length }
        : { available: false as const, delivered: null, failed: null, total: 0, note: 'Mail extension has not written delivery data yet' };

      let activeMetric: MetricValue;
      try {
        const sessions = await store.collectionGroup('sessions', { limit: 100000 });
        if (!sessions.length) activeMetric = metric(null, false, 'No session activity data in users/{uid}/sessions');
        else {
          const ids = new Set<string>();
          for (const s of sessions) {
            const last = isoOrNull(pick(s.data, ['lastActive', 'lastActiveAt', 'updatedAt'], null) as string | null);
            if (last && inRange(last, range)) { const segs = s.path.split('/'); ids.add(segs[segs.length - 3] ?? s.id); }
          }
          activeMetric = metric(ids.size, true);
        }
      } catch { activeMetric = metric(null, false, 'Session data unavailable'); }

      res.json({
        data: {
          range: range.label,
          activeUsers: activeMetric,
          registrations: {
            total: metric(usersInRange.length),
            byRole: labeled(groupCount(usersInRange, ['role', 'userRole', 'accountType'])),
            bySport: labeled(groupCount(usersInRange, ['sport', 'primarySport'])),
            byCity: labeled(groupCount(usersInRange, ['city'])),
          },
          content: {
            posts: metric(posts.filter((p) => str(p.data.type, 'post') !== 'clip').length),
            clips: metric(posts.filter((p) => str(p.data.type) === 'clip').length),
            stories: metric(stories.length),
            events: metric(events.length),
          },
          contentByType: [
            { label: 'Posts', count: posts.filter((p) => str(p.data.type, 'post') !== 'clip').length },
            { label: 'Clips', count: posts.filter((p) => str(p.data.type) === 'clip').length },
            { label: 'Stories', count: stories.length },
            { label: 'Events', count: events.length },
          ],
          reports: {
            total: metric(reports.length),
            open: metric(reports.filter((x) => ['open', 'new', 'under_review', 'escalated'].includes(str(x.data.status, 'open'))).length),
            resolved: metric(reports.filter((x) => ['closed', 'action_taken', 'resolved', 'dismissed'].includes(str(x.data.status))).length),
            byStatus: labeled(groupCount(reports, ['status'])),
            avgResolutionHours: resolutionMetric,
          },
          restrictions: {
            suspended: metric(users.filter((u) => u.data.accountStatus === 'suspended').length),
            restricted: metric(users.filter((u) => u.data.accountStatus === 'restricted').length),
            deleted: metric(users.filter((u) => u.data.accountStatus === 'deleted' || u.data.isDeleted === true).length),
            auditActions: metric(audits.filter((a) => ['users.suspend', 'users.restrict', 'users.delete'].includes(str(a.data.action))).length),
          },
          email: emailOutcomes,
          emailOutcomes: emailOutcomes.available
            ? [
                { label: 'Delivered', count: emailOutcomes.delivered ?? 0 },
                { label: 'Failed', count: emailOutcomes.failed ?? 0 },
              ]
            : [],
          support: {
            avgFirstResponseHours: supportMetric,
            open: metric(reports.filter((x) => ['open', 'new', 'under_review', 'escalated'].includes(str(x.data.status, 'open'))).length),
            openTickets: metric(reports.filter((x) => ['open', 'new', 'under_review', 'escalated'].includes(str(x.data.status, 'open'))).length),
          },
        },
      });
    } catch (e) { next(e); }
  });
  return r;
}
