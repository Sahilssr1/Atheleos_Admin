import type { Store } from '../db/store.js';
import { AppError } from '../utils/errors.js';
import { nowIso } from '../utils/helpers.js';
import type { ContentType } from '@atheleos/shared';

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
}
