# Atheleos Admin — Architecture

## What Atheleos actually is (inspected 2026-10-22)

`Sahilssr1/Atheleos_App` is a **Flutter** client backed by:

| Layer | Technology |
|---|---|
| Auth | Firebase Authentication |
| Database | Cloud Firestore, project `atheleos-4a146` |
| Server code | Firebase Functions (Node 20, TypeScript, firebase-admin, nodemailer) |
| Media | Cloudflare R2 + a Cloudflare Worker (`cloudflare_worker/`), Firebase `media`/`processing_jobs`/`media_references` bookkeeping |
| Email out | `mail` Firestore queue (Trigger Email–style) written by the app's NotificationService; SMTP settings exist in the app env (Hostinger, `contact@atheleos.in`) |
| Push/in-app notifications | `users/{uid}/notifications` subcollection + FCM tokens |

Real collections the admin panel works with: `users` (+ subcollections
`verification_applications`, `notifications`, `sessions`, `followers`, `following`, `blocked_users`, …),
`usernames`, `posts` (with `type: 'post' | 'clip'` — clips are the reels — and `comments`/`likes`
subcollections), `stories` (24-hour expiry in the app), `chats` (+ `messages`), `events`
(+ `participants`), `reports` (the app's report-a-problem **and** contact-support both write here),
`mail`, `media`, `processing_jobs`, `media_references`, `system_data`.

There was **no** admin API, no admin identity system, no appeals system, and no account-status model
(only `users.isDeleted`). Those are created here, server-side.

## This repository

```
Atheleos_Admin/
├── packages/shared/    # @atheleos/shared — permissions, role matrix, API types (single contract)
├── apps/api/           # @atheleos/api — Express + TypeScript Admin API (the security boundary)
├── apps/web/           # @atheleos/web — React + Vite + TypeScript admin panel (SPA)
├── docs/               # architecture, API contract, Firestore additions for the app repo
└── scripts/
```

### Why an API instead of direct Firestore access from the browser
The browser never receives database credentials. Every request goes through the Admin API, which
authenticates the staff session, checks the exact permission for the action, validates input,
performs the Firestore/Auth operation with the Firebase Admin SDK, and writes an audit record.
Hiding a button in the UI is presentation only — the API is the control.

### Staff identity
Admins are **not** app users. Staff accounts live in `admin_users` (bcrypt password hashes,
role, status, MFA secret, lockout state). Sessions are JWTs in an httpOnly cookie, backed by an
`admin_sessions` record so a session can be revoked. There is no public registration; the first
Super Admin is created with `npm run bootstrap-admin`, later admins are created by a Super Admin
in Admin Team. Optional TOTP MFA, 5-failure/15-minute lockout, login rate limiting, and a full
`admin_login_events` trail feed the Security Center.

### Data modes
- `DATA_MODE=firestore` (production): Firebase Admin SDK against the real project. If Firebase
  credentials are missing, data endpoints fail with `503 FIREBASE_NOT_CONFIGURED` and the UI shows a
  configuration-required state — the API never fabricates platform data.
- `DATA_MODE=memory`: an in-process implementation of the same store interface, for automated tests
  and local UI development only. It is visibly labelled in the UI and in `/system/health`.

### Admin-owned Firestore collections (new)
`admin_users`, `admin_sessions`, `admin_login_events`, `admin_audit_logs`, `moderation_cases`,
`appeals`, `admin_notification_jobs`, `admin_email_drafts`, `admin_password_resets`,
`admin_config` (`platform`, `roles` docs). App documents gain admin-managed fields only
(`accountStatus*`, `moderationStatus*`); no app data is duplicated into a second database.

### Known app-side follow-ups (documented, not hidden)
1. The Flutter feed does not yet filter `moderationStatus` / `accountStatus`; hidden/removed flags
   are written correctly by this panel, and the app needs the small query filter described in
   `docs/FIRESTORE_ADDITIONS.md` for those flags to change what users see.
2. The app has no appeals UI; the `appeals` collection + API exist here so the app can integrate.
3. DAU/WAU/MAU are approximated from `users/{uid}/sessions.lastActive`; if no session data exists
   for a range, analytics reports the metric as **unavailable**, never as zero.
