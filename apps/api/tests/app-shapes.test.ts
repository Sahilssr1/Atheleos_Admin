// Regression tests: documents seeded in the EXACT shapes the Flutter app
// (Atheleos_App) writes to Firestore — field names taken from its Dart models
// (PostModel, CommentModel, ChatRoom, ChatMessage, EventModel, StoryModel).
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { MemoryStore } from '../src/db/store.js';
import { loadEnv } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { nowIso } from '../src/utils/helpers.js';

const cfg = loadEnv({}, {
  DATA_MODE: 'memory',
  NODE_ENV: 'test',
  ADMIN_JWT_SECRET: 'test-secret-test-secret-0123456789',
  SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', IMAP_HOST: '', IMAP_USER: '', IMAP_PASS: '',
  smtpConfigured: false, imapConfigured: false, firebaseConfigured: false,
} as never);

const PASS = 'Password123!';
let app: ReturnType<typeof createApp>;
let cookie: string;

beforeAll(async () => {
  const store = new MemoryStore();
  await store.setDoc('admin_users/root', {
    email: 'root@test.dev', name: 'Root', role: 'super_admin',
    passwordHash: bcrypt.hashSync(PASS, 4), mfaEnabled: false, mfaSecret: null,
    status: 'active', failedLogins: 0, lockedUntil: null, lastLoginAt: null, createdAt: nowIso(),
  });
  // User exactly as ProfileModel.toMap writes it
  await store.setDoc('users/uidA', {
    uid: 'uidA', name: 'Aarav Sharma', displayName: 'Aarav Sharma', fullName: 'Aarav Sharma',
    username: 'aarav', avatarUrl: 'https://cdn.example/a.png', photoUrl: 'https://cdn.example/a.png',
    role: 'Athlete', verified: true, verificationStatus: 'approved', sport: 'Football',
    city: 'Patna', state: 'Bihar', country: 'India', email: 'aarav@app.dev', phoneNumber: '9812345678',
    followersCount: 120, followingCount: 80, postsCount: 2, clipsCount: 1, createdAt: nowIso(),
  });
  // Post exactly as PostModel.toMap writes it (content + media[].mediaType)
  await store.setDoc('posts/postA', {
    id: 'postA', type: 'post', userId: 'uidA', userName: 'aarav', userAvatar: 'https://cdn.example/a.png',
    sport: 'Football', verified: true, content: 'Match day highlights',
    media: [{ mediaUrl: 'https://cdn.example/v.mp4', mediaType: 'video', thumbnailUrl: 'https://cdn.example/t.jpg' }],
    likes: 42, likeCount: 42, commentsCount: 1, shares: 3, views: 900, deleted: false, createdAt: nowIso(),
  });
  // Comment exactly as CommentModel.toMap writes it (username + profileImage)
  await store.setDoc('posts/postA/comments/comA', {
    commentId: 'comA', postId: 'postA', userId: 'uidA', username: 'aarav',
    profileImage: 'https://cdn.example/a.png', verified: true, text: 'Great game!',
    createdAt: nowIso(), likesCount: 5, replyCount: 0, edited: false, parentId: null, likedBy: [],
  });
  // Chat room + message exactly as ChatRoom/ChatMessage toMap write them
  await store.setDoc('chats/chatA', {
    id: 'chatA', participantIds: ['uidA', 'uidB'], lastMessage: 'See you at practice',
    lastMessageTimestamp: nowIso(), unreadBy: ['uidB'], type: 'one-to-one', createdAt: nowIso(), updatedAt: nowIso(),
  });
  await store.setDoc('chats/chatA/messages/msgA', {
    id: 'msgA', senderId: 'uidA', receiverId: 'uidB', content: 'See you at practice',
    timestamp: nowIso(), type: 'text', messageState: 'sent', deliveryState: 'DELIVERED',
  });
  // Event exactly as EventModel.toMap writes it
  await store.setDoc('events/evA', {
    eventId: 'evA', organizerUid: 'uidA', organizerName: 'Aarav Sharma', title: 'Patna Football Trials',
    description: 'Open trials', sport: 'Football', bannerUrl: 'https://cdn.example/b.jpg',
    eventStatus: 'Upcoming', startDate: nowIso(), createdAt: nowIso(),
  });
  app = createApp(store, cfg);
  const res = await request(app).post('/api/admin/auth/login').send({ email: 'root@test.dev', password: PASS });
  expect(res.status).toBe(200);
  cookie = String(res.headers['set-cookie']?.[0]).split(';')[0];
});

describe('real Atheleos_App document shapes', () => {
  it('post: caption comes from `content`, media type from `mediaType`, author from userName/userAvatar', async () => {
    const res = await request(app).get('/api/admin/content?type=post').set('Cookie', cookie);
    expect(res.status).toBe(200);
    const item = res.body.data.items.find((i: { id: string }) => i.id === 'postA');
    expect(item).toBeTruthy();
    expect(item.caption).toBe('Match day highlights');
    expect(item.authorName).toBe('aarav');
    expect(item.authorAvatar).toBe('https://cdn.example/a.png');
    expect(item.media[0].type).toBe('video');
    expect(item.likes).toBe(42);
  });

  it('comment: author from `username`, avatar from `profileImage`', async () => {
    const res = await request(app).get('/api/admin/comments').set('Cookie', cookie);
    expect(res.status).toBe(200);
    const item = res.body.data.items.find((i: { id: string }) => i.id === 'comA');
    expect(item).toBeTruthy();
    expect(item.authorName).toBe('aarav');
    expect(item.authorAvatar).toBe('https://cdn.example/a.png');
    expect(item.postId).toBe('postA');
  });

  it('conversation: lastMessageAt from `lastMessageTimestamp`; message state from messageState/deliveryState', async () => {
    const list = await request(app).get('/api/admin/messages/conversations').set('Cookie', cookie);
    expect(list.status).toBe(200);
    const conv = list.body.data.items.find((i: { id: string }) => i.id === 'chatA');
    expect(conv).toBeTruthy();
    expect(conv.lastMessageAt).toBeTruthy();
    const msgs = await request(app).get('/api/admin/messages/conversations/chatA').set('Cookie', cookie);
    expect(msgs.status).toBe(200);
    expect(msgs.body.data.conversation.id).toBe('chatA');
    const m = msgs.body.data.messages.items.find((i: { id: string }) => i.id === 'msgA');
    expect(m.content).toBe('See you at practice');
    expect(m.createdAt).toBeTruthy();
  });

  it('analytics: breakdowns are [{label,count}] arrays the web charts consume', async () => {
    const res = await request(app).get('/api/admin/analytics?range=90d').set('Cookie', cookie);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(Array.isArray(d.registrations.byRole)).toBe(true);
    expect(d.registrations.byRole.find((x: { label: string }) => x.label === 'Athlete')?.count).toBe(1);
    expect(Array.isArray(d.contentByType)).toBe(true);
    expect(d.contentByType.find((x: { label: string }) => x.label === 'Posts')?.count).toBe(1);
    expect(d.reports.resolved.value).toBe(0);
    expect(Array.isArray(d.reports.byStatus)).toBe(true);
    expect(d.support.open.value).toBe(0);
  });

  it('event: listed as content type event with organizer + banner', async () => {
    const res = await request(app).get('/api/admin/content?type=event').set('Cookie', cookie);
    expect(res.status).toBe(200);
    const item = res.body.data.items.find((i: { id: string }) => i.id === 'evA');
    expect(item).toBeTruthy();
    expect(item.authorId).toBe('uidA');
    expect(item.caption).toBe('Patna Football Trials');
    expect(item.media[0].url).toBe('https://cdn.example/b.jpg');
  });
});
