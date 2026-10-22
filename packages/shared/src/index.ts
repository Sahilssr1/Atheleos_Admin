// ─────────────────────────────────────────────────────────────────────────────
// Atheleos Admin — shared contract between the Admin API and the Admin Web app.
//
// The Atheleos application (Sahilssr1/Atheleos_App) is a Flutter client backed
// by Firebase Authentication + Cloud Firestore (project `atheleos-4a146`),
// Firebase Functions (Node 20) and a Cloudflare R2 media worker.
// This package describes the *admin* surface only: staff identity, RBAC, and
// the normalized shapes the Admin API returns for app data.
// ─────────────────────────────────────────────────────────────────────────────

export const PERMISSIONS = [
  'dashboard.view',
  'users.view',
  'users.view_contact', // email / phone of app users — sensitive
  'users.suspend',
  'users.restrict',
  'users.warn',
  'users.delete',
  'users.verify', // verification application decisions
  'content.view',
  'content.moderate',
  'comments.moderate',
  'moderation.view',
  'moderation.decide',
  'reports.view',
  'reports.manage',
  'appeals.view',
  'appeals.decide',
  'messages.view', // private conversations — sensitive, every access audited
  'messages.send',
  'email.view',
  'email.send',
  'notifications.view',
  'notifications.send',
  'support.view',
  'support.reply',
  'analytics.view',
  'admins.manage',
  'roles.manage',
  'audit.view',
  'settings.manage',
  'security.view',
  'system.view',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ADMIN_ROLES = ['super_admin', 'admin', 'moderator', 'support', 'analyst'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  moderator: 'Moderator',
  support: 'Support Agent',
  analyst: 'Analyst',
};

/** Default permission matrix. Super Admin can override per-role in `admin_config/roles`. */
export const DEFAULT_ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  super_admin: [...PERMISSIONS],
  admin: [
    'dashboard.view', 'users.view', 'users.view_contact', 'users.suspend', 'users.restrict',
    'users.warn', 'users.delete', 'users.verify', 'content.view', 'content.moderate',
    'comments.moderate', 'moderation.view', 'moderation.decide', 'reports.view', 'reports.manage',
    'appeals.view', 'appeals.decide', 'messages.view', 'messages.send', 'email.view', 'email.send',
    'notifications.view', 'notifications.send', 'support.view', 'support.reply', 'analytics.view',
    'audit.view', 'settings.manage', 'security.view', 'system.view',
  ],
  moderator: [
    'dashboard.view', 'users.view', 'users.restrict', 'users.warn', 'users.verify',
    'content.view', 'content.moderate', 'comments.moderate', 'moderation.view', 'moderation.decide',
    'reports.view', 'reports.manage', 'appeals.view', 'appeals.decide', 'messages.view',
    'notifications.view', 'support.view',
  ],
  support: [
    'dashboard.view', 'users.view', 'users.view_contact', 'reports.view', 'support.view',
    'support.reply', 'email.view', 'email.send', 'notifications.view', 'content.view',
  ],
  analyst: [
    'dashboard.view', 'analytics.view', 'users.view', 'content.view', 'reports.view',
    'notifications.view', 'system.view',
  ],
};

export interface StaffUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  permissions: Permission[]; // effective permissions (role matrix + overrides)
  mfaEnabled: boolean;
  status: 'active' | 'disabled';
  lastLoginAt: string | null;
  createdAt: string;
}

export type AccountStatus = 'active' | 'suspended' | 'restricted' | 'deleted';

/** Normalized view of an Atheleos app user (Firestore `users/{uid}`). */
export interface AppUser {
  id: string; // uid
  username: string;
  displayName: string;
  email: string | null; // null when caller lacks users.view_contact
  phone: string | null; // null when caller lacks users.view_contact
  role: string; // Athlete | Coach | Brand | Federation | ''
  sport: string;
  city: string;
  state: string;
  country: string;
  avatarUrl: string;
  verified: boolean;
  verificationStatus: string; // none|pending|underReview|approved|rejected|moreInfoRequired
  accountStatus: AccountStatus;
  statusReason: string;
  statusExpiresAt: string | null;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  clipsCount: number;
  reportCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export type ContentType = 'post' | 'clip' | 'story' | 'event';

export interface ContentItem {
  id: string;
  type: ContentType;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  caption: string;
  media: { url: string; type: string; thumbnailUrl?: string }[];
  sport?: string;
  status: 'visible' | 'hidden' | 'removed';
  likes: number;
  commentsCount: number;
  shares: number;
  views: number;
  reportCount: number;
  createdAt: string | null;
  expiresAt?: string | null; // stories
}

export interface CommentItem {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  text: string;
  status: 'visible' | 'hidden' | 'removed';
  likesCount: number;
  replyCount: number;
  parentId: string | null;
  createdAt: string | null;
}

export type ReportStatus =
  | 'new' | 'under_review' | 'escalated' | 'action_taken' | 'dismissed' | 'appealed' | 'closed' | 'open';

export interface ReportItem {
  id: string;
  reporterId: string;
  targetType: 'user' | 'post' | 'clip' | 'story' | 'comment' | 'message' | 'event' | 'technical' | 'support' | 'unknown';
  targetId: string;
  reason: string;
  description: string;
  status: ReportStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assignedTo: string | null;
  screenshotUrls: string[];
  resolution: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export type ModerationStatus =
  | 'new' | 'under_review' | 'escalated' | 'action_taken' | 'dismissed' | 'appealed' | 'closed';

export interface ModerationCase {
  id: string;
  reportId: string | null;
  targetType: string;
  targetId: string;
  targetAuthorId: string;
  reason: string;
  evidence: string[];
  status: ModerationStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assignedTo: string | null;
  decision: string | null;
  decisionReason: string | null;
  decidedBy: string | null;
  notes: { by: string; text: string; at: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface Appeal {
  id: string;
  userId: string;
  caseId: string | null;
  targetType: string;
  targetId: string;
  originalDecision: string;
  appealReason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationApplication {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  role: string;
  status: string; // pending|underReview|approved|rejected|moreInfoRequired
  details: Record<string, unknown>;
  submittedAt: string | null;
  updatedAt: string | null;
}

export interface Conversation {
  id: string;
  type: string; // one-to-one | group
  name: string;
  participantIds: string[];
  lastMessage: string;
  lastMessageAt: string | null;
  unreadBy: string[];
}

export interface ChatMessageItem {
  id: string;
  senderId: string;
  content: string;
  type: string;
  state: string;
  createdAt: string | null;
}

export interface AuditLogEntry {
  id: string;
  adminId: string;
  adminEmail: string;
  action: string;
  resourceType: string;
  resourceId: string;
  reason: string;
  outcome: 'success' | 'failure';
  correlationId: string;
  createdAt: string;
}

export interface MetricValue {
  value: number | null; // null = not available from real data (never fake a zero)
  available: boolean;
  note?: string;
}

export interface DashboardOverview {
  range: string;
  totals: {
    users: MetricValue;
    newUsers: MetricValue;
    activeUsers: MetricValue;
    suspendedUsers: MetricValue;
    posts: MetricValue;
    clips: MetricValue;
    stories: MetricValue;
    comments: MetricValue;
    reportsOpen: MetricValue;
    moderationPending: MetricValue;
    supportOpen: MetricValue;
    emailsQueued: MetricValue;
    emailsDelivered: MetricValue;
    emailsFailed: MetricValue;
    notificationsSent: MetricValue;
  };
  series: {
    registrations: { date: string; count: number }[];
    content: { date: string; count: number }[];
    reports: { date: string; count: number }[];
  };
  recentActions: AuditLogEntry[];
  health: { firestore: boolean; email: boolean; messaging: boolean };
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number | null; // null when the backend cannot count cheaply
}

export interface ApiError {
  error: { code: string; message: string };
}
