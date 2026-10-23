import type { Store } from '../db/store.js';
import { AppError } from '../utils/errors.js';
import { nowIso, str } from '../utils/helpers.js';
import type { ContentType } from '@atheleos/shared';
import { notifyUser } from './userService.js';

export function collectionForType(type: ContentType): string {
  if (type === 'story') return 'stories';
  if (type === 'event') return 'events';
  return 'posts';
}

export async function applyContentAction(
  store: Store,
  type: ContentType,
  id: string,
  action: 'hide' | 'restore' | 'remove',
  adminId: string,
  reason: string,
): Promise<void> {
  const coll = collectionForType(type);
  const path = `${coll}/${id}`;
  const doc = await store.getDoc(path);
  // For posts/clips, verify the type matches when a type field exists.
  if (!doc) throw new AppError('NOT_FOUND', 'Content not found', 404);
  if ((type === 'post' || type === 'clip') && doc.data.type && String(doc.data.type) !== type) {
    throw new AppError('NOT_FOUND', 'Content not found', 404);
  }
  const status = action === 'hide' ? 'hidden' : action === 'remove' ? 'removed' : 'visible';
  const update: Record<string, unknown> = {
    moderationStatus: status,
    moderatedBy: adminId,
    moderatedAt: nowIso(),
    moderationReason: reason,
    updatedAt: nowIso(),
  };
  if (type === 'event') update.eventStatus = status === 'visible' ? 'published' : status;
  if (action === 'remove') update.deleted = true;
  if (action === 'restore') update.deleted = false;
  await store.updateDoc(path, update);

  const authorId = str(doc.data.authorId || doc.data.userId || doc.data.uid || doc.data.creatorId || '');
  if (authorId) {
    const actionLabel = action === 'remove' ? 'removed' : action === 'hide' ? 'hidden' : 'restored';
    const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
    const title = `${typeLabel} ${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)}`;
    const body = action === 'restore'
      ? `Your ${type} has been restored by administration. Reason: ${reason}`
      : `Your ${type} was ${actionLabel} by administration for the following reason: ${reason}`;

    await notifyUser(store, authorId, title, body, {
      kind: `content_${actionLabel}`,
      contentType: type,
      contentId: id,
      action,
      reason,
      by: adminId,
    }).catch(() => undefined);

    await store.addDoc('moderation_actions', {
      userId: authorId,
      action: `content.${action}`,
      targetType: type,
      targetId: id,
      reason,
      by: adminId,
      createdAt: nowIso(),
    }).catch(() => undefined);
  }
}

export async function applyCommentAction(
  store: Store,
  postId: string,
  commentId: string,
  action: 'hide' | 'restore' | 'remove',
  adminId: string,
  reason: string,
): Promise<void> {
  const path = `posts/${postId}/comments/${commentId}`;
  const doc = await store.getDoc(path);
  if (!doc) throw new AppError('NOT_FOUND', 'Comment not found', 404);
  const status = action === 'hide' ? 'hidden' : action === 'remove' ? 'removed' : 'visible';
  const update: Record<string, unknown> = {
    moderationStatus: status,
    moderatedBy: adminId,
    moderatedAt: nowIso(),
    moderationReason: reason,
    updatedAt: nowIso(),
  };
  if (action === 'remove') update.deleted = true;
  if (action === 'restore') update.deleted = false;
  await store.updateDoc(path, update);

  const authorId = str(doc.data.authorId || doc.data.userId || doc.data.uid || '');
  if (authorId) {
    const actionLabel = action === 'remove' ? 'removed' : action === 'hide' ? 'hidden' : 'restored';
    const title = `Comment ${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)}`;
    const body = action === 'restore'
      ? `Your comment has been restored by administration. Reason: ${reason}`
      : `Your comment was ${actionLabel} by administration for the following reason: ${reason}`;

    await notifyUser(store, authorId, title, body, {
      kind: `comment_${actionLabel}`,
      commentId,
      postId,
      action,
      reason,
      by: adminId,
    }).catch(() => undefined);

    await store.addDoc('moderation_actions', {
      userId: authorId,
      action: `comments.${action}`,
      targetType: 'comment',
      targetId: commentId,
      postId,
      reason,
      by: adminId,
      createdAt: nowIso(),
    }).catch(() => undefined);
  }
}
