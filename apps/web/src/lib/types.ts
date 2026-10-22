// Response shapes that live only in the Admin API (not in @atheleos/shared).
// Kept deliberately tolerant: pages render whatever the API returns and show
// "Not available" / empty states instead of inventing values.
import type {
  AppUser, AuditLogEntry, ContentItem, MetricValue, Paginated, ReportItem, VerificationApplication,
} from '@atheleos/shared';

export interface UserDetailResponse {
  user: AppUser;
  content: ContentItem[];
  reports: ReportItem[];
  restrictions: AuditLogEntry[];
  support: ReportItem[];
  verification?: VerificationApplication | null;
}

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle?: string;
  href?: string;
  kind?: string;
}
export interface SearchGroup { kind: string; label?: string; items: SearchResultItem[] }
export interface SearchResponse {
  groups?: SearchGroup[];
  [key: string]: unknown;
}

/** Normalize the /search payload (grouped array or per-kind arrays) into groups. */
export function normalizeSearch(data: SearchResponse | null | undefined): SearchGroup[] {
  if (!data) return [];
  if (Array.isArray(data.groups)) {
    return data.groups
      .map((g) => ({
        kind: g.kind,
        label: g.label ?? g.kind,
        items: (g.items ?? []).map((raw) => {
          const it = raw as SearchResultItem & Record<string, unknown>;
          return {
            id: String(it.id ?? ''),
            title: String(it.title ?? it.name ?? it.username ?? it.id ?? ''),
            subtitle: it.subtitle ?? (it.email as string | undefined),
            href: it.href,
            kind: g.kind,
          };
        }),
      }))
      .filter((g) => g.items.length > 0);
  }
  const out: SearchGroup[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (!Array.isArray(value)) continue;
    out.push({
      kind: key,
      label: key,
      items: value.map((raw) => {
        const it = raw as Record<string, unknown>;
        return {
          id: String(it.id ?? ''),
          title: String(it.title ?? it.name ?? it.displayName ?? it.username ?? it.caption ?? it.subject ?? it.lastMessage ?? it.description ?? it.id ?? ''),
          subtitle: (it.subtitle as string) ?? (it.email as string) ?? (it.status as string) ?? (it.to as string),
          href: it.href as string | undefined,
          kind: key,
        };
      }),
    });
  }
  return out.filter((g) => g.items.length > 0);
}

/** Default landing route for a search result when the API didn't supply an href. */
export function searchHref(kind: string, id: string): string {
  switch (kind) {
    case 'users': case 'user': return `/users/${id}`;
    case 'posts': case 'post': case 'clips': case 'clip': case 'content': return '/content';
    case 'reports': case 'report': return '/reports';
    case 'tickets': case 'ticket': case 'support': return '/support';
    case 'email': case 'emails': return '/email';
    case 'conversations': case 'messages': return '/messages';
    default: return '/';
  }
}

// ── Email ────────────────────────────────────────────────────
export interface EmailStatus {
  smtpConfigured: boolean;
  imapConfigured: boolean;
  from: string | null;
  queueCount: number;
}
export interface EmailSummary {
  uid: string;
  from: string;
  to?: string;
  subject: string;
  date: string | null;
  unread?: boolean;
  seen?: boolean;
  hasAttachments?: boolean;
  snippet?: string;
}
export interface EmailMessage extends EmailSummary {
  cc?: string;
  text?: string;
  html?: string;
  attachments?: { filename: string; contentType?: string; size?: number }[];
}
export interface EmailQueueItem {
  id: string;
  to: string | string[];
  subject?: string;
  createdAt?: string | null;
  delivery?: { state?: string; attempts?: number; error?: string | null; startTime?: string | null; endTime?: string | null };
  [key: string]: unknown;
}
export interface EmailDraft {
  id: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

// ── Notifications ────────────────────────────────────────────
export interface NotificationJob {
  id: string;
  title: string;
  body?: string;
  audience?: unknown;
  deliveredCount?: number;
  count?: number;
  failedCount?: number;
  alsoEmail?: boolean;
  createdBy?: string;
  createdAt: string | null;
  status?: string;
}

// ── Settings / security / health / analytics ─────────────────
export interface IntegrationStatus { name: string; label?: string; configured: boolean; detail?: string }
export interface PlatformSettings {
  appName?: string;
  supportEmail?: string;
  moderation?: Record<string, unknown>;
  sessionTtlMinutes?: number;
  retentionDays?: number;
  [key: string]: unknown;
}
export interface SettingsResponse {
  platform?: PlatformSettings;
  integrations?: IntegrationStatus[];
  [key: string]: unknown;
}

export interface LoginEvent {
  id: string;
  adminId?: string;
  email?: string;
  success?: boolean;
  ip?: string;
  createdAt: string | null;
  [key: string]: unknown;
}
export interface SecurityOverview {
  loginEvents?: LoginEvent[];
  recentLogins?: LoginEvent[];
  failedAttempts?: MetricValue | number;
  failedAttempts24h?: MetricValue | number;
  activeSessions?: Record<string, unknown>[];
  permissionChanges?: AuditLogEntry[];
  integrations?: IntegrationStatus[];
  currentSession?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface HealthCheck {
  name: string;
  label?: string;
  status: 'ok' | 'error' | 'not_configured' | string;
  latencyMs?: number | null;
  message?: string;
}
export interface HealthResponse {
  ok?: boolean;
  dataMode?: string;
  mode?: string;
  checks?: HealthCheck[];
  services?: HealthCheck[];
  [key: string]: unknown;
}

export interface LabeledCount { label: string; count: number }
export interface AnalyticsResponse {
  range?: string;
  registrations?: { total?: MetricValue; byRole?: LabeledCount[]; bySport?: LabeledCount[]; byCity?: LabeledCount[] };
  contentByType?: LabeledCount[];
  reports?: { byStatus?: LabeledCount[]; avgResolutionHours?: MetricValue; resolved?: MetricValue; total?: MetricValue };
  restrictions?: LabeledCount[] | MetricValue;
  emailOutcomes?: LabeledCount[];
  support?: { avgFirstResponseHours?: MetricValue; avgResponseHours?: MetricValue; open?: MetricValue };
  [key: string]: unknown;
}

export type { Paginated };
