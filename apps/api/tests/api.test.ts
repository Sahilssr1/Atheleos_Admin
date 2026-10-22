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
  ADMIN_JWT_SECRET: 'test-secret-for-vitest-only-32-chars-long',
  SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', IMAP_HOST: '', IMAP_USER: '', IMAP_PASS: '',
  smtpConfigured: false, imapConfigured: false, firebaseConfigured: false,
} as never);

const PASS = 'Password123!';
async function seedAdmin(store: MemoryStore, id: string, email: string, role: string) {
  await store.setDoc(`admin_users/${id}`, {
    email, name: email.split('@')[0], role, passwordHash: bcrypt.hashSync(PASS, 4),
    mfaEnabled: false, mfaSecret: null, status: 'active', failedLogins: 0, lockedUntil: null,
    lastLoginAt: null, createdAt: nowIso(),
  });
}

async function buildStore(): Promise<MemoryStore> {
  const store = new MemoryStore();
  await seedAdmin(store, 'admin-super', 'super@test.dev', 'super_admin');
  await seedAdmin(store, 'admin-analyst', 'analyst@test.dev', 'analyst');
  await seedAdmin(store, 'admin-mod', 'mod@test.dev', 'moderator');
  await seedAdmin(store, 'admin-support', 'support@test.dev', 'support');
  await store.setDoc('users/u1', {
    username: 'athlete1', fullName: 'Athlete One', email: 'u1@app.dev', phoneNumber: '9999999999',
    role: 'Athlete', sport: 'Football', city: 'Patna', verified: false, verificationStatus: 'pending',
    accountStatus: 'active', followersCount: 10, followingCount: 5, postsCount: 1, createdAt: nowIso(),
  });
  await store.setDoc('users/u2', {
    username: 'coach1', fullName: 'Coach One', email: 'u2@app.dev', role: 'Coach', sport: 'Cricket',
    accountStatus: 'active', createdAt: nowIso(),
  });
  await store.setDoc('users/u1/verification_applications/va1', {
    status: 'pending', role: 'Athlete', submittedAt: nowIso(), documentType: 'id-card',
  });
  await store.setDoc('posts/p1', {
    type: 'post', authorId: 'u1', authorName: 'Athlete One', caption: 'Hello world',
    moderationStatus: 'visible', likes: 3, createdAt: nowIso(),
  });
  await store.setDoc('posts/p1/comments/c1', {
    authorId: 'u2', authorName: 'Coach One', text: 'Nice post', moderationStatus: 'visible', createdAt: nowIso(),
  });
  await store.setDoc('reports/r1', {
    uid: 'u1', description: 'App crashes on upload', status: 'open', createdAt: nowIso(), screenshotUrls: [],
  });
  await store.setDoc('chats/ch1', {
    type: 'one-to-one', participantIds: ['u1', 'u2'], lastMessage: 'hi', lastMessageAt: nowIso(),
  });
  await store.setDoc('chats/ch1/messages/m1', { senderId: 'u1', text: 'hi', content: 'hi', type: 'text', createdAt: nowIso() });
  return store;
}

async function login(app: ReturnType<typeof createApp>, email: string, password = PASS): Promise<string> {
  const res = await request(app).post('/api/admin/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  const cookie = res.headers['set-cookie']?.[0];
  expect(cookie).toBeTruthy();
  return String(cookie).split(';')[0];
}

describe('Atheleos Admin API (memory mode)', () => {
  let store: MemoryStore;
  let app: ReturnType<typeof createApp>;
  let superCookie: string; let analystCookie: string; let modCookie: string; let supportCookie: string;

  beforeAll(async () => {
    store = await buildStore();
    app = createApp(store, cfg);
    superCookie = await login(app, 'super@test.dev');
    analystCookie = await login(app, 'analyst@test.dev');
    modCookie = await login(app, 'mod@test.dev');
    supportCookie = await login(app, 'support@test.dev');
  });

  it('auth: me returns staff user, logout revokes session', async () => {
    const me = await request(app).get('/api/admin/auth/me').set('Cookie', superCookie);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe('super@test.dev');
    expect(me.body.data.role).toBe('super_admin');
    expect(me.body.data.permissions).toContain('users.suspend');

    const cookie2 = await login(app, 'mod@test.dev');
    const out = await request(app).post('/api/admin/auth/logout').set('Cookie', cookie2);
    expect(out.status).toBe(200);
    const meAfter = await request(app).get('/api/admin/auth/me').set('Cookie', cookie2);
    expect(meAfter.status).toBe(401);
  });

  it('auth: unauthenticated request is 401 with error shape', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('validation: bad login body returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/admin/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('RBAC: analyst cannot suspend (403), moderator cannot manage admins (403)', async () => {
    const res = await request(app).post('/api/admin/users/u1/suspend').set('Cookie', analystCookie).send({ reason: 'test' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    const admins = await request(app).get('/api/admin/admins').set('Cookie', modCookie);
    expect(admins.status).toBe(403);
  });

  it('users: search, suspend → reinstate flow, audit log written', async () => {
    const search = await request(app).get('/api/admin/users?q=athlete1').set('Cookie', superCookie);
    expect(search.status).toBe(200);
    expect(search.body.data.total).toBe(1);
    expect(search.body.data.items[0].id).toBe('u1');
    // analyst lacks users.view_contact → email hidden; super sees it
    const searchAnalyst = await request(app).get('/api/admin/users?q=athlete1').set('Cookie', analystCookie);
    expect(searchAnalyst.body.data.items[0].email).toBeNull();

    const susp = await request(app).post('/api/admin/users/u1/suspend').set('Cookie', superCookie).send({ reason: 'spam behaviour' });
    expect(susp.status).toBe(200);
    let doc = await store.getDoc('users/u1');
    expect(doc?.data.accountStatus).toBe('suspended');

    const rein = await request(app).post('/api/admin/users/u1/reinstate').set('Cookie', superCookie).send({ reason: 'appeal accepted' });
    expect(rein.status).toBe(200);
    doc = await store.getDoc('users/u1');
    expect(doc?.data.accountStatus).toBe('active');

    const audits = await store.listDocs('admin_audit_logs', { limit: 1000 });
    expect(audits.some((a) => a.data.action === 'users.suspend' && a.data.resourceId === 'u1')).toBe(true);
    expect(audits.some((a) => a.data.action === 'users.reinstate')).toBe(true);
  });

  it('content: hide → restore a post', async () => {
    const hide = await request(app).post('/api/admin/content/post/p1/hide').set('Cookie', modCookie).send({ reason: 'policy' });
    expect(hide.status).toBe(200);
    let doc = await store.getDoc('posts/p1');
    expect(doc?.data.moderationStatus).toBe('hidden');
    const restore = await request(app).post('/api/admin/content/post/p1/restore').set('Cookie', modCookie).send({ reason: 'reinstated' });
    expect(restore.status).toBe(200);
    doc = await store.getDoc('posts/p1');
    expect(doc?.data.moderationStatus).toBe('visible');
  });

  it('comments: list via collection group and hide', async () => {
    const list = await request(app).get('/api/admin/comments?postId=p1').set('Cookie', superCookie);
    expect(list.status).toBe(200);
    expect(list.body.data.total).toBe(1);
    const hide = await request(app).post('/api/admin/comments/p1/c1/hide').set('Cookie', modCookie).send({ reason: 'abuse' });
    expect(hide.status).toBe(200);
    const doc = await store.getDoc('posts/p1/comments/c1');
    expect(doc?.data.moderationStatus).toBe('hidden');
  });

  it('verifications: decide approves and sets user fields + notification', async () => {
    const list = await request(app).get('/api/admin/verifications').set('Cookie', superCookie);
    expect(list.status).toBe(200);
    expect(list.body.data.total).toBe(1);
    const decide = await request(app).post('/api/admin/verifications/u1/va1/decide').set('Cookie', superCookie)
      .send({ decision: 'approved', reason: 'documents verified', badge: 'verified' });
    expect(decide.status).toBe(200);
    const app2 = await store.getDoc('users/u1/verification_applications/va1');
    expect(app2?.data.status).toBe('approved');
    const user = await store.getDoc('users/u1');
    expect(user?.data.verified).toBe(true);
    expect(user?.data.verificationStatus).toBe('approved');
    const notifs = await store.listDocs('users/u1/notifications', { limit: 100 });
    expect(notifs.length).toBeGreaterThan(0);
  });

  it('moderation: case create + decide warns the target user', async () => {
    const created = await request(app).post('/api/admin/moderation/cases').set('Cookie', modCookie)
      .send({ targetType: 'user', targetId: 'u2', targetAuthorId: 'u2', reason: 'harassment report', priority: 'high' });
    expect(created.status).toBe(201);
    const caseId = created.body.data.id;
    const decide = await request(app).post(`/api/admin/moderation/cases/${caseId}/decide`).set('Cookie', modCookie)
      .send({ decision: 'warn', reason: 'first offence', accountAction: 'warn' });
    expect(decide.status).toBe(200);
    expect(decide.body.data.status).toBe('action_taken');
    const notifs = await store.listDocs('users/u2/notifications', { limit: 100 });
    expect(notifs.some((n) => n.data.title === 'Account warning')).toBe(true);
    const actions = await store.listDocs('moderation_actions', { limit: 100 });
    expect(actions.some((a) => a.data.userId === 'u2')).toBe(true);
  });

  it('appeals: approve reinstates a suspended user', async () => {
    await request(app).post('/api/admin/users/u2/suspend').set('Cookie', superCookie).send({ reason: 'test suspension' });
    let user = await store.getDoc('users/u2');
    expect(user?.data.accountStatus).toBe('suspended');
    const created = await request(app).post('/api/admin/appeals').set('Cookie', superCookie)
      .send({ userId: 'u2', targetType: 'user', targetId: 'u2', originalDecision: 'suspend', appealReason: 'mistaken identity' });
    expect(created.status).toBe(201);
    const appealId = created.body.data.id;
    const decide = await request(app).post(`/api/admin/appeals/${appealId}/decide`).set('Cookie', superCookie)
      .send({ decision: 'approved', note: 'verified identity' });
    expect(decide.status).toBe(200);
    user = await store.getDoc('users/u2');
    expect(user?.data.accountStatus).toBe('active');
  });

  it('reports: patch status (open report normalized, canonical write-back)', async () => {
    const list = await request(app).get('/api/admin/reports').set('Cookie', superCookie);
    expect(list.status).toBe(200);
    expect(list.body.data.items[0].status).toBe('new');
    const patch = await request(app).patch('/api/admin/reports/r1').set('Cookie', superCookie)
      .send({ status: 'under_review', priority: 'high' });
    expect(patch.status).toBe(200);
    expect(patch.body.data.status).toBe('under_review');
    const doc = await store.getDoc('reports/r1');
    expect(doc?.data.status).toBe('under_review');
  });

  it('messages: reading a conversation writes audit; support role gets 403', async () => {
    const denied = await request(app).get('/api/admin/messages/conversations/ch1').set('Cookie', supportCookie);
    expect(denied.status).toBe(403);
    const before = (await store.listDocs('admin_audit_logs', { limit: 1000 })).filter((a) => a.data.action === 'messages.conversation_viewed').length;
    const res = await request(app).get('/api/admin/messages/conversations/ch1').set('Cookie', superCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.messages.total).toBe(1);
    const after = (await store.listDocs('admin_audit_logs', { limit: 1000 })).filter((a) => a.data.action === 'messages.conversation_viewed').length;
    expect(after).toBe(before + 1);
    const send = await request(app).post('/api/admin/messages/conversations/ch1/send').set('Cookie', superCookie).send({ content: 'Admin reply' });
    expect(send.status).toBe(201);
    expect(send.body.data.senderId).toBe('admin:admin-super');
  });

  it('notifications: preview counts audience, send writes inboxes, dedupe → 409', async () => {
    const preview = await request(app).post('/api/admin/notifications/preview').set('Cookie', superCookie)
      .send({ audience: { kind: 'all' } });
    expect(preview.status).toBe(200);
    expect(preview.body.data.count).toBe(2);
    const send = await request(app).post('/api/admin/notifications/send').set('Cookie', superCookie)
      .send({ title: 'Maintenance', body: 'Tonight 10pm', audience: { kind: 'all' }, dedupeKey: 'maint-1' });
    expect(send.status).toBe(201);
    expect(send.body.data.sentCount).toBe(2);
    const notifs = await store.listDocs('users/u1/notifications', { limit: 100 });
    expect(notifs.some((n) => n.data.title === 'Maintenance' && (n.data.data as Record<string, unknown>)?.adminJobId === send.body.data.id)).toBe(true);
    const dup = await request(app).post('/api/admin/notifications/send').set('Cookie', superCookie)
      .send({ title: 'Maintenance', body: 'Tonight 10pm', audience: { kind: 'all' }, dedupeKey: 'maint-1' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_NOTIFICATION');
  });

  it('email: status not-configured; send falls back to mail queue', async () => {
    const status = await request(app).get('/api/admin/email/status').set('Cookie', superCookie);
    expect(status.status).toBe(200);
    expect(status.body.data.smtpConfigured).toBe(false);
    expect(status.body.data.imapConfigured).toBe(false);
    const inbox = await request(app).get('/api/admin/email/inbox').set('Cookie', superCookie);
    expect(inbox.status).toBe(503);
    expect(inbox.body.error.code).toBe('EMAIL_NOT_CONFIGURED');
    const send = await request(app).post('/api/admin/email/send').set('Cookie', superCookie)
      .send({ to: ['u1@app.dev'], subject: 'Hello', html: '<p>Hi</p>' });
    expect(send.status).toBe(200);
    expect(send.body.data.via).toBe('queue');
    const mail = await store.listDocs('mail', { limit: 100 });
    expect(mail.some((m) => (m.data.message as Record<string, unknown>)?.subject === 'Hello')).toBe(true);
  });

  it('settings: patch persists and writes audit; secrets never returned', async () => {
    const patch = await request(app).patch('/api/admin/settings').set('Cookie', superCookie)
      .send({ maintenanceMode: true, smtpPass: 'should-be-stripped' });
    expect(patch.status).toBe(200);
    expect(patch.body.data.maintenanceMode).toBe(true);
    expect(patch.body.data.smtpPass).toBeUndefined();
    const get = await request(app).get('/api/admin/settings').set('Cookie', superCookie);
    expect(get.body.data.integrations).toBeTruthy();
    const audits = await store.listDocs('admin_audit_logs', { limit: 1000 });
    expect(audits.some((a) => a.data.action === 'settings.update')).toBe(true);
  });

  it('dashboard + search + public health', async () => {
    const dash = await request(app).get('/api/admin/dashboard/overview?range=7d').set('Cookie', superCookie);
    expect(dash.status).toBe(200);
    expect(dash.body.data.totals.users.value).toBe(2);
    expect(dash.body.data.totals.posts.value).toBe(1);
    expect(dash.body.data.totals.activeUsers.available).toBe(false); // no session data seeded → unavailable, not fake zero
    expect(dash.body.data.series.registrations.length).toBe(7);
    const search = await request(app).get('/api/admin/search?q=athlete1').set('Cookie', superCookie);
    expect(search.status).toBe(200);
    expect(search.body.data.users.length).toBe(1);
    const pub = await request(app).get('/api/admin/system/health/public');
    expect(pub.status).toBe(200);
    expect(pub.body.ok).toBe(true);
  });

  it('support: reply writes an in-app notification to the reporter', async () => {
    const reply = await request(app).post('/api/admin/support/tickets/r1/reply').set('Cookie', supportCookie)
      .send({ message: 'We are looking into it', via: 'inapp' });
    expect(reply.status).toBe(200);
    expect(reply.body.data.sentVia).toContain('inapp');
    const notifs = await store.listDocs('users/u1/notifications', { limit: 100 });
    expect(notifs.some((n) => n.data.title === 'Support reply')).toBe(true);
  });

  it('password reset: request queues a mail doc (token never in response)', async () => {
    const res = await request(app).post('/api/admin/auth/request-password-reset').send({ email: 'mod@test.dev' });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('token=');
    const mail = await store.listDocs('mail', { limit: 1000 });
    expect(mail.some((m) => m.data.source === 'admin-password-reset')).toBe(true);
    const resets = await store.listDocs('admin_password_resets', { limit: 10 });
    expect(resets.length).toBe(1);
  });
});

describe('auth lockout', () => {
  it('5 failed logins lock the account; correct password then returns 423', async () => {
    const store = await buildStore();
    const app = createApp(store, cfg);
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/admin/auth/login').send({ email: 'analyst@test.dev', password: 'wrong' });
      expect(res.status).toBe(401);
    }
    const locked = await request(app).post('/api/admin/auth/login').send({ email: 'analyst@test.dev', password: PASS });
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    const events = await store.listDocs('admin_login_events', { limit: 100 });
    expect(events.filter((e) => e.data.success === false).length).toBeGreaterThanOrEqual(5);
  });
});
