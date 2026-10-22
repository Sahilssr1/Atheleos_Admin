# Admin API contract (binding for apps/api and apps/web)

Base path: `/api/admin`. All endpoints except `POST /auth/login`, `POST /auth/reset-password`,
`POST /auth/request-password-reset` and `GET /system/health/public` require the session cookie
`atheleos_admin_session` (JWT, httpOnly) and the permission listed below. Authorization is enforced
server-side on every endpoint.

Success: `{ "data": ... }` (lists: `{ "data": { "items": [...], "page": 1, "pageSize": 25, "total": n|null } }`).
Error: `{ "error": { "code": "STRING_CODE", "message": "..." } }` with a proper HTTP status.

Types come from `@atheleos/shared` (packages/shared/src/index.ts). Do not duplicate them.

## Data source mapping (Atheleos_App, Firestore project atheleos-4a146)
- App users: `users/{uid}` — aliases: fullName|displayName|name, avatarUrl|photoUrl,
  email|googleEmail|alternateEmail, phoneNumber|phone. Admin-managed account state lives on the
  same doc: `accountStatus` (active|suspended|restricted|deleted), `accountStatusReason`,
  `accountStatusAt`, `accountStatusBy`, `accountStatusExpiresAt`, plus legacy `isDeleted`.
  Suspending also disables the Firebase Auth user; reinstating re-enables it.
- Posts/clips: `posts/{id}`, field `type` = 'post'|'clip' (clips = reels), `deleted` flag,
  moderation fields `moderationStatus` (visible|hidden|removed), `moderatedBy`, `moderatedAt`, `moderationReason`.
- Comments: `posts/{postId}/comments/{commentId}` (collection-group `comments`), same moderation fields.
- Stories: `stories/{id}` (24h expiry from createdAt), same moderation fields.
- Events: `events/{id}`, `eventStatus`; moderation sets `moderationStatus` too.
- Reports: `reports/{id}` — app writes {uid, description, device, os, screenshotUrls, status:'open', resolution}.
  Admin normalizes status open→new view but writes canonical moderation statuses back.
  Reports double as support tickets (the app's "Report a Problem / Contact Support" writes here).
- Verification: collection-group `verification_applications` (under users/{uid}); decision updates
  the application, the user doc's protected verification fields, a notification, and an audit log.
- Chats: `chats/{id}` + `chats/{id}/messages/{id}`. Reading a conversation writes an audit entry.
  Admin-sent message: senderId = `admin:{staffId}`, type 'text', plus `isAdminMessage: true`.
- Notifications: app inbox is `users/{uid}/notifications/{id}` {type,title,body,read,createdAt,...}.
  Admin sends also record a job in `admin_notification_jobs` with a dedupeKey.
- Email out: app delivery queue is `mail/{id}` {to, message:{subject,html}, delivery:{...}} (Trigger Email
  extension / worker). Admin compose sends via SMTP when configured, else queues into `mail`.
  Email in: IMAP (imapflow) when IMAP_* env set. Drafts: `admin_email_drafts`.
- Admin-owned collections: `admin_users`, `admin_sessions`, `admin_login_events`, `admin_audit_logs`,
  `moderation_cases`, `appeals`, `admin_notification_jobs`, `admin_config` (docs: `platform`, `roles`),
  `admin_email_drafts`, `admin_password_resets`.

## Endpoints
Auth:
- POST /auth/login {email,password} → StaffUser; if MFA enabled → {mfaRequired:true, mfaToken}
- POST /auth/mfa/verify {mfaToken, code} → StaffUser (sets cookie)
- POST /auth/logout → {ok:true} (revokes session)
- GET /auth/me → StaffUser
- POST /auth/change-password {currentPassword,newPassword}
- POST /auth/mfa/setup → {secret, otpauthUrl}; POST /auth/mfa/enable {code}; POST /auth/mfa/disable {code}
- POST /auth/request-password-reset {email} → always {ok:true}; creates token + queues mail doc
- POST /auth/reset-password {token,newPassword}

Dashboard/search:
- GET /dashboard/overview?range=today|7d|30d|90d|custom&from&to [dashboard.view] → DashboardOverview
- GET /search?q=&type= [users.view or relevant] → grouped results, permission-filtered

Users:
- GET /users?q&status&role&verified&sort&page&pageSize [users.view] → Paginated<AppUser>
- GET /users/:id [users.view] → {user, content, reports, restrictions(audit+actions), support}
- POST /users/:id/suspend {reason, expiresAt?} [users.suspend]
- POST /users/:id/reinstate {reason} [users.suspend]
- POST /users/:id/restrict {reason, restrictions[], expiresAt?} [users.restrict]
- POST /users/:id/warn {reason, message} [users.warn] (creates user notification + moderation_actions record)
- POST /users/:id/delete {reason} [users.delete] — soft delete: accountStatus=deleted, isDeleted=true,
  Firebase Auth disabled. Permanent purge is a separate POST /users/:id/purge {reason, confirm:'DELETE'}
  [users.delete, super_admin only] deleting the Firestore user doc + Auth user.
- GET /verifications?status&page [users.verify] → Paginated<VerificationApplication>
- POST /verifications/:uid/:applicationId/decide {decision: approved|rejected|moreInfoRequired|underReview, reason, badge?, level?} [users.verify]

Content:
- GET /content?type=post|clip|story|event&q&status&page [content.view] → Paginated<ContentItem>
- GET /content/:type/:id [content.view]
- POST /content/:type/:id/hide|restore|remove {reason} [content.moderate]
- POST /content/bulk {type, ids[], action, reason} [content.moderate] (max 50)
- GET /comments?q&postId&page [content.view] → Paginated<CommentItem>
- POST /comments/:postId/:commentId/hide|restore|remove {reason} [comments.moderate]

Moderation/reports/appeals:
- GET /moderation/cases?status&priority&page [moderation.view] → Paginated<ModerationCase>
- POST /moderation/cases {reportId?, targetType, targetId, reason, priority} [moderation.view]
- GET /moderation/cases/:id [moderation.view]
- PATCH /moderation/cases/:id {assignedTo?, status?, priority?} [moderation.view]
- POST /moderation/cases/:id/note {text} [moderation.view]
- POST /moderation/cases/:id/decide {decision, reason, contentAction?, accountAction?} [moderation.decide]
- GET /reports?status&priority&q&page [reports.view] → Paginated<ReportItem>
- GET /reports/:id [reports.view]; PATCH /reports/:id {status?, assignedTo?, priority?, resolution?} [reports.manage]
- POST /reports/:id/note {text} [reports.manage] (stored in moderation_cases or report notes array)
- GET /appeals?status&page [appeals.view]; POST /appeals {userId, caseId?, targetType, targetId, originalDecision, appealReason} [appeals.view]
- POST /appeals/:id/decide {decision: approved|rejected, note} [appeals.decide] — approval reverses the
  linked action (restore content / reinstate account) and notifies the user.

Messages:
- GET /messages/conversations?q&page [messages.view]
- GET /messages/conversations/:id?page [messages.view] — audits `messages.conversation_viewed`
- POST /messages/conversations/:id/send {content} [messages.send]
- POST /messages/conversations/:id/note {text} [messages.view] → moderation case/note

Email:
- GET /email/status [email.view] → {smtpConfigured, imapConfigured, from, queueCount}
- GET /email/inbox?page&pageSize&folder=INBOX [email.view] — 503 EMAIL_NOT_CONFIGURED when IMAP unset
- GET /email/inbox/:uid [email.view]
- GET /email/queue?page [email.view] → mail collection docs with delivery status
- GET /email/drafts [email.view]; POST /email/drafts; DELETE /email/drafts/:id
- POST /email/send {to[], cc[], bcc[], subject, html, draftId?} [email.send] → {via:'smtp'|'queue', id}
- POST /email/reply / /email/forward — same as send with threading headers/subject handled client-side;
  implement as POST /email/send only (reply/forward are compose modes in the UI).

Notifications:
- GET /notifications/jobs?page [notifications.view]
- POST /notifications/preview {audience} [notifications.send] → {count}
  audience = {kind:'all'} | {kind:'role', role} | {kind:'user', userId} | {kind:'sport', sport}
- POST /notifications/send {title, body, audience, alsoEmail?, dedupeKey?} [notifications.send]
  → writes users/{uid}/notifications docs in batches, optional mail queue docs, one job record.
  Duplicate dedupeKey within 24h → 409 DUPLICATE_NOTIFICATION.

Support (view over reports + replies via notification/mail):
- GET /support/tickets?status&q&page [support.view] → Paginated<ReportItem>
- GET /support/tickets/:id [support.view]
- POST /support/tickets/:id/reply {message, via:'inapp'|'email'|'both'} [support.reply]
- PATCH /support/tickets/:id {status?, assignedTo?, priority?} [support.view + reports.manage semantics:
  require support.reply for reply, reports.manage OR support.view for status? — use support.view for read,
  status changes require support.reply]

Analytics:
- GET /analytics?range [analytics.view] → registrations by role/sport/city, content by type,
  report resolution times, restriction counts, email outcomes, support response times;
  each metric uses MetricValue semantics (available:false when source data does not exist).

Admin team / roles / audit / settings / security / system:
- GET /admins [admins.manage]; POST /admins {email,name,role,password} [admins.manage]
- PATCH /admins/:id {role?, status?, name?} [admins.manage]; POST /admins/:id/reset-password [admins.manage]
- GET /roles [roles.manage or admins.manage] → role matrix (defaults merged with admin_config/roles)
- PUT /roles/:role {permissions[]} [roles.manage]
- GET /audit-logs?action&adminId&page [audit.view]
- GET /settings [settings.manage or system.view] → admin_config/platform + integration status (secrets never returned)
- PATCH /settings {…} [settings.manage]
- GET /security/overview [security.view] → recent admin_login_events, failed attempts, active sessions,
  permission changes (from audit), integration status. Only real data.
- GET /system/health [system.view] → firestore/smtp/imap/worker/functions checks with latency;
  GET /system/health/public → {ok} only (for uptime checks).
