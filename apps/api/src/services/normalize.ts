import type { AppUser, CommentItem, ContentItem, ContentType, ModerationCase, ReportItem, VerificationApplication, Appeal, Conversation, ChatMessageItem } from '@atheleos/shared';
import { bool, isoOrNull, num, pick, str } from '../utils/helpers.js';
import type { DocResult } from '../db/store.js';

export function normalizeUser(doc: DocResult, canViewContact: boolean): AppUser {
  const d = doc.data;
  const status = str(pick(d, ['accountStatus'], d.isDeleted ? 'deleted' : 'active'), 'active') as AppUser['accountStatus'];
  return {
    id: doc.id,
    username: str(pick(d, ['username', 'userName'])),
    displayName: str(pick(d, ['fullName', 'displayName', 'name', 'username'])),
    email: canViewContact ? (pick(d, ['email', 'googleEmail', 'alternateEmail'], null) as string | null) : null,
    phone: canViewContact ? (pick(d, ['phoneNumber', 'phone'], null) as string | null) : null,
    role: str(pick(d, ['role', 'userRole', 'accountType'])),
    sport: str(pick(d, ['sport', 'primarySport'])),
    city: str(pick(d, ['city'])),
    state: str(pick(d, ['state'])),
    country: str(pick(d, ['country'])),
    avatarUrl: str(pick(d, ['avatarUrl', 'photoUrl', 'profilePhotoUrl'])),
    verified: bool(d.verified) || bool(d.isVerified),
    verificationStatus: str(pick(d, ['verificationStatus'], 'none'), 'none'),
    accountStatus: (['active', 'suspended', 'restricted', 'deleted'].includes(status) ? status : 'active') as AppUser['accountStatus'],
    statusReason: str(pick(d, ['accountStatusReason'])),
    statusExpiresAt: isoOrNull(d.accountStatusExpiresAt),
    followersCount: num(pick(d, ['followersCount', 'followers'], 0)),
    followingCount: num(pick(d, ['followingCount', 'following'], 0)),
    postsCount: num(pick(d, ['postsCount', 'postCount'], 0)),
    clipsCount: num(pick(d, ['clipsCount', 'clipCount'], 0)),
    reportCount: num(pick(d, ['reportCount'], 0)),
    createdAt: isoOrNull(pick(d, ['createdAt', 'joinedAt'], null) as string | null),
    updatedAt: isoOrNull(d.updatedAt),
  };
}

export function rawEmail(d: Record<string, unknown>): string | null {
  const v = pick(d, ['email', 'googleEmail', 'alternateEmail'], null);
  return v ? String(v) : null;
}

export function normalizeContent(doc: DocResult, forcedType?: ContentType): ContentItem {
  const d = doc.data;
  let type: ContentType = forcedType ?? (str(d.type, 'post') === 'clip' ? 'clip' : 'post');
  if (doc.path.startsWith('stories/')) type = 'story';
  if (doc.path.startsWith('events/')) type = 'event';
  const media: ContentItem['media'] = [];
  if (Array.isArray(d.media)) {
    for (const m of d.media as Record<string, unknown>[]) {
      if (m && typeof m === 'object') media.push({ url: str(pick(m, ['url', 'mediaUrl'])), type: str(pick(m, ['type', 'mediaType'], 'image'), 'image'), thumbnailUrl: str(pick(m, ['thumbnailUrl'])) || undefined });
      else if (typeof m === 'string') media.push({ url: m, type: 'image' });
    }
  }
  const single = pick(d, ['mediaUrl', 'imageUrl', 'videoUrl', 'coverUrl', 'bannerUrl'], null);
  if (!media.length && single) media.push({ url: String(single), type: d.videoUrl ? 'video' : 'image', thumbnailUrl: str(pick(d, ['thumbnailUrl'])) || undefined });
  const statusRaw = str(pick(d, ['moderationStatus'], d.deleted ? 'removed' : 'visible'), 'visible');
  const createdAt = isoOrNull(pick(d, ['createdAt', 'timestamp'], null) as string | null);
  let expiresAt: string | null | undefined;
  if (type === 'story') {
    expiresAt = isoOrNull(d.expiresAt) ?? (createdAt ? new Date(new Date(createdAt).getTime() + 24 * 3600 * 1000).toISOString() : null);
  } else if (type === 'event') {
    expiresAt = isoOrNull(pick(d, ['startDate', 'eventDate', 'date', 'startAt'], null) as string | null);
  }
  return {
    id: doc.id,
    type,
    authorId: str(pick(d, ['authorId', 'userId', 'uid', 'createdBy', 'organizerUid', 'organizerId'])),
    authorName: str(pick(d, ['authorName', 'userName', 'organizerName', 'displayName'])),
    authorAvatar: str(pick(d, ['authorAvatar', 'userAvatar', 'avatarUrl', 'photoUrl'])),
    caption: type === 'event'
      ? str(pick(d, ['title', 'name', 'content', 'caption', 'description']))
      : str(pick(d, ['content', 'caption', 'text', 'description', 'title', 'name'])),
    media,
    sport: str(pick(d, ['sport'], '')) || undefined,
    status: (['visible', 'hidden', 'removed'].includes(statusRaw) ? statusRaw : 'visible') as ContentItem['status'],
    likes: num(pick(d, ['likes', 'likesCount', 'likeCount'], 0)),
    commentsCount: num(pick(d, ['commentsCount', 'commentCount'], 0)),
    shares: num(pick(d, ['shares', 'sharesCount', 'shareCount'], 0)),
    views: num(pick(d, ['views', 'viewsCount', 'viewCount'], 0)),
    reportCount: num(pick(d, ['reportCount'], 0)),
    createdAt,
    expiresAt,
  };
}

export function normalizeComment(doc: DocResult): CommentItem {
  const d = doc.data;
  const segs = doc.path.split('/');
  const postId = str(d.postId) || (segs.length >= 2 ? segs[segs.length - 3] ?? '' : '');
  const statusRaw = str(pick(d, ['moderationStatus'], d.deleted ? 'removed' : 'visible'), 'visible');
  return {
    id: doc.id,
    postId,
    authorId: str(pick(d, ['authorId', 'userId', 'uid'])),
    authorName: str(pick(d, ['authorName', 'username', 'userName', 'displayName'])),
    authorAvatar: str(pick(d, ['authorAvatar', 'profileImage', 'userAvatar', 'avatarUrl', 'photoUrl'])),
    text: str(pick(d, ['text', 'comment', 'content', 'body'])),
    status: (['visible', 'hidden', 'removed'].includes(statusRaw) ? statusRaw : 'visible') as CommentItem['status'],
    likesCount: num(pick(d, ['likesCount', 'likes', 'likeCount'], 0)),
    replyCount: num(pick(d, ['replyCount', 'repliesCount'], 0)),
    parentId: (pick(d, ['parentId'], null) as string | null) ?? null,
    createdAt: isoOrNull(pick(d, ['createdAt', 'timestamp'], null) as string | null),
  };
}

export function normalizeReport(doc: DocResult): ReportItem {
  const d = doc.data;
  let status = str(pick(d, ['status'], 'open'), 'open');
  if (status === 'open') status = 'new';
  const targetTypeRaw = str(pick(d, ['targetType', 'type', 'category'], ''));
  const allowed = ['user', 'post', 'clip', 'story', 'comment', 'message', 'event', 'technical', 'support', 'unknown'];
  let targetType = allowed.includes(targetTypeRaw) ? targetTypeRaw : 'unknown';
  if (targetType === 'unknown' && !d.targetId && !d.postId) targetType = 'support';
  return {
    id: doc.id,
    reporterId: str(pick(d, ['uid', 'reporterId', 'userId', 'reportedBy'])),
    targetType: targetType as ReportItem['targetType'],
    targetId: str(pick(d, ['targetId', 'postId', 'reportedUserId', 'reportedId'])),
    reason: str(pick(d, ['reason', 'category', 'issueType', 'title'])),
    description: str(pick(d, ['description', 'details', 'message', 'body'])),
    status: status as ReportItem['status'],
    priority: (['low', 'normal', 'high', 'urgent'].includes(str(d.priority)) ? str(d.priority) : 'normal') as ReportItem['priority'],
    assignedTo: (pick(d, ['assignedTo'], null) as string | null) ?? null,
    screenshotUrls: Array.isArray(d.screenshotUrls) ? (d.screenshotUrls as string[]) : [],
    resolution: str(pick(d, ['resolution'])),
    createdAt: isoOrNull(pick(d, ['createdAt', 'timestamp'], null) as string | null),
    updatedAt: isoOrNull(pick(d, ['updatedAt'], null) as string | null),
  };
}

export function normalizeCase(doc: DocResult): ModerationCase {
  const d = doc.data;
  return {
    id: doc.id,
    reportId: (pick(d, ['reportId'], null) as string | null) ?? null,
    targetType: str(pick(d, ['targetType'], 'unknown'), 'unknown'),
    targetId: str(pick(d, ['targetId'])),
    targetAuthorId: str(pick(d, ['targetAuthorId'])),
    reason: str(pick(d, ['reason'])),
    evidence: Array.isArray(d.evidence) ? (d.evidence as string[]) : [],
    status: str(pick(d, ['status'], 'new'), 'new') as ModerationCase['status'],
    priority: (['low', 'normal', 'high', 'urgent'].includes(str(d.priority)) ? str(d.priority) : 'normal') as ModerationCase['priority'],
    assignedTo: (pick(d, ['assignedTo'], null) as string | null) ?? null,
    decision: (pick(d, ['decision'], null) as string | null) ?? null,
    decisionReason: (pick(d, ['decisionReason'], null) as string | null) ?? null,
    decidedBy: (pick(d, ['decidedBy'], null) as string | null) ?? null,
    notes: Array.isArray(d.notes) ? (d.notes as ModerationCase['notes']) : [],
    createdAt: str(pick(d, ['createdAt'], '')),
    updatedAt: str(pick(d, ['updatedAt'], '')),
  };
}

export function normalizeAppeal(doc: DocResult): Appeal {
  const d = doc.data;
  return {
    id: doc.id,
    userId: str(pick(d, ['userId'])),
    caseId: (pick(d, ['caseId'], null) as string | null) ?? null,
    targetType: str(pick(d, ['targetType'], 'unknown'), 'unknown'),
    targetId: str(pick(d, ['targetId'])),
    originalDecision: str(pick(d, ['originalDecision'])),
    appealReason: str(pick(d, ['appealReason', 'reason'])),
    status: str(pick(d, ['status'], 'pending'), 'pending') as Appeal['status'],
    reviewedBy: (pick(d, ['reviewedBy'], null) as string | null) ?? null,
    reviewNote: str(pick(d, ['reviewNote'])),
    createdAt: str(pick(d, ['createdAt'], '')),
    updatedAt: str(pick(d, ['updatedAt'], '')),
  };
}

export function normalizeVerification(doc: DocResult): VerificationApplication {
  const d = doc.data;
  const segs = doc.path.split('/');
  const userId = str(d.userId) || (segs.length >= 2 ? segs[segs.length - 3] ?? '' : '');
  const { status, userId: _u, username, displayName, role, submittedAt, updatedAt, createdAt, ...rest } = d as Record<string, unknown>;
  return {
    id: doc.id,
    userId,
    username: str(username),
    displayName: str(displayName),
    role: str(role),
    status: str(status, 'pending'),
    details: rest as Record<string, unknown>,
    submittedAt: isoOrNull((submittedAt ?? createdAt) as string | null),
    updatedAt: isoOrNull(updatedAt as string | null),
  };
}

export function normalizeConversation(doc: DocResult): Conversation {
  const d = doc.data;
  return {
    id: doc.id,
    type: str(pick(d, ['type'], 'one-to-one'), 'one-to-one'),
    name: str(pick(d, ['name', 'title', 'groupName'])),
    participantIds: Array.isArray(d.participantIds) ? (d.participantIds as string[]) : Array.isArray(d.participants) ? (d.participants as string[]) : [],
    lastMessage: str(pick(d, ['lastMessage', 'lastMessageText'])),
    lastMessageAt: isoOrNull(pick(d, ['lastMessageTimestamp', 'lastMessageAt', 'updatedAt'], null) as string | null),
    unreadBy: Array.isArray(d.unreadBy) ? (d.unreadBy as string[]) : [],
  };
}

export function normalizeChatMessage(doc: DocResult): ChatMessageItem {
  const d = doc.data;
  return {
    id: doc.id,
    senderId: str(pick(d, ['senderId', 'userId', 'from'])),
    content: str(pick(d, ['content', 'text', 'message', 'body'])),
    type: str(pick(d, ['type'], 'text'), 'text'),
    state: str(pick(d, ['messageState', 'deliveryState', 'state', 'status'], 'sent'), 'sent'),
    createdAt: isoOrNull(pick(d, ['createdAt', 'timestamp'], null) as string | null),
  };
}
