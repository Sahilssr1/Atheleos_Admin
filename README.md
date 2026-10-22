# Atheleos Admin Panel

A production-grade administration and moderation console for the **Atheleos** platform
(`Sahilssr1/Atheleos_App` — Flutter + Firebase). Built from scratch in this repository.

The panel gives authorized staff one place to manage users, verification, content, moderation,
reports and appeals, direct messages, email, notifications, support, analytics, the admin team,
roles and permissions, audit logs, platform settings, security and system health — with an
Instagram-inspired interface and a real, permission-enforced API. There is no mock data anywhere:
when an integration is not configured, the panel says so instead of inventing numbers.

## Architecture

```
Atheleos_Admin/
├── packages/shared/   # @atheleos/shared — permissions, role matrix, API types (single contract)
├── apps/api/          # @atheleos/api — Express + TypeScript Admin API (the security boundary)
├── apps/web/          # @atheleos/web — React + Vite + TypeScript panel (SPA)
├── docs/              # architecture notes, API contract, Firestore additions for the app repo
└── scripts/
```

- The browser **never** talks to Firestore directly. Every request goes through the Admin API,
  which authenticates the staff session, checks the exact permission, validates input, performs
  the operation with the Firebase Admin SDK, and writes an audit record.
- The app data source is the **same Firestore project** as the mobile app (`atheleos-4a146`):
  `users`, `posts` (type `post` | `clip` — clips are reels), `stories`, `chats`, `events`,
  `reports`, `mail`, `media`, plus the admin-owned collections listed in
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Staff identity is separate from app users: `admin_users` with bcrypt password hashes, optional
  TOTP MFA, login lockout (5 failures → 15 minutes), revocable cookie sessions, and **no public
  registration** — the first Super Admin is created with the bootstrap command below.

## Quick start (local development)

```bash
npm install                      # from the repository root (npm workspaces)

# 1) Configure the API
cp apps/api/.env.example apps/api/.env   # then fill in real values (see below)

# 2) Create the first Super Admin (one time)
BOOTSTRAP_ADMIN_EMAIL=you@atheleos.in BOOTSTRAP_ADMIN_NAME="Your Name" \
BOOTSTRAP_ADMIN_PASSWORD='a-strong-password' npm run bootstrap-admin

# 3) Run
npm run dev:api                  # API on http://localhost:4000
npm run dev:web                  # Panel on http://localhost:5174 (proxies /api to :4000)
```

For a UI-only local run without Firebase credentials, set `DATA_MODE=memory` in `apps/api/.env`.
Memory mode is **development/testing only** — data resets on restart and the panel labels it.

## Environment variables (`apps/api/.env`)

| Variable | Purpose |
|---|---|
| `PORT`, `WEB_ORIGIN` | API port; the panel's origin (CORS + reset links) |
| `DATA_MODE` | `firestore` (production) or `memory` (dev/tests only) |
| `FIREBASE_PROJECT_ID` | `atheleos-4a146` |
| `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Admin SDK service account (server-side only) |
| `ADMIN_JWT_SECRET` | Session signing secret — use a dedicated one, never the app JWT secret |
| `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` | Outgoing mail (Hostinger: `smtp.hostinger.com:465`, secure) |
| `IMAP_HOST/PORT/SECURE/USER/PASS` | Incoming mail for the Email Center inbox (Hostinger: `imap.hostinger.com:993`) |
| `MEDIA_WORKER_URL`, `FUNCTIONS_BASE_URL` | Optional health checks for the Cloudflare media worker / Firebase Functions |
| `BOOTSTRAP_ADMIN_*` | One-time first-admin creation; remove after use |

Without Firebase credentials the API still boots, but data endpoints return
`503 FIREBASE_NOT_CONFIGURED` and the panel shows a configuration-required state.
Without IMAP, the inbox returns `503 EMAIL_NOT_CONFIGURED`; without SMTP, outgoing admin mail is
queued into the app's `mail` collection for the mail extension/worker.

## What is implemented

- **Overview dashboard** — real totals (users, new/active where session data exists, suspended,
  posts/clips/stories/comments, open reports, pending moderation, support, email queue), daily
  series, recent admin actions, integration health; unavailable metrics are reported as
  *unavailable*, never as fake zeros.
- **Global search** across users, content, reports, tickets, conversations and queued email,
  filtered by the caller's permissions.
- **Users** — directory with search/filters/sort/pagination, detail pages (content, reports,
  restriction history, support), and reason-required, audited actions: suspend / reinstate
  (also disables/enables the Firebase Auth user), restrict, warn, soft-delete, and super-admin-only
  purge. Contact details are hidden unless the role has `users.view_contact`.
- **Verification queue** — collection-group review of `verification_applications`; decisions update
  the application, the user's protected verification fields, notify the user, and audit — atomically
  in effect.
- **Content** — posts, clips (reels), stories, events with media previews, detail, hide/restore/
  remove and bulk actions; **Comments** manager over the comments collection-group.
- **Moderation** — cases with assignment, priority, internal notes, escalation and decisions that
  apply content and account actions; **Reports** triage (the app's reports double as support
  tickets); **Appeals** whose approval reverses the original action and notifies the user.
- **Direct Messages** — 3-pane workspace. Private conversations require `messages.view`, every
  conversation read is audit-logged, and admin replies are marked `isAdminMessage` in the app data.
- **Email Center** — IMAP inbox + reader, compose/reply/forward, drafts, and the outgoing `mail`
  queue with delivery status. SMTP send failures surface as real errors — never fake success.
- **Notifications** — broadcast composer with audience preview (all / role / sport / single user),
  confirm-before-send, in-app delivery into `users/{uid}/notifications`, optional email, job
  history, and 24-hour duplicate protection (409).
- **Support desk** — tickets from the reports stream, replies via in-app and/or email, status,
  priority and assignment, response-time analytics where reply data exists.
- **Analytics** — registrations by role/sport/city, content by type, report resolution, account
  restrictions, email outcomes, support response times.
- **Admin Team & Roles** — staff CRUD with self/last-super-admin guards, and a full
  role × permission matrix editor persisted to `admin_config/roles`.
- **Audit Logs, Security Center, Platform Settings, System Health** — every sensitive action is
  logged with admin, reason, resource and correlation ID; security shows real login events,
  failures and sessions; health checks Firestore, SMTP, IMAP, the media worker and Functions with
  latency and honest `not_configured` states.

## Tests

```bash
npm run typecheck   # shared + api + web
npm test            # API: 24 tests (auth, lockout, RBAC, moderation flows, appeals reversal,
                    # notifications dedupe, email fallback, real app document shapes)
                    # Web: 6 tests (permission-gated sidebar, login + MFA step, dashboard states)
npm run build       # production builds for all packages
```

## Before production

1. Add the Firebase service account to `apps/api/.env` and set `DATA_MODE=firestore`.
2. Apply the rules/indexes in [docs/FIRESTORE_ADDITIONS.md](docs/FIRESTORE_ADDITIONS.md) to the
   Atheleos_App repo, and make the Flutter feed honour `moderationStatus` / `accountStatus`
   (details in that document) so hidden content and suspended accounts take effect in the app.
3. Serve `apps/web` behind the same origin as the API (or set `VITE_API_BASE`), over HTTPS, and
   set `WEB_ORIGIN` to the panel's URL.
4. Rotate any credentials that were ever committed or shared, and keep `.env` out of git (it is
   git-ignored by default here).

See [docs/API_CONTRACT.md](docs/API_CONTRACT.md) for the full endpoint/permission reference and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design decisions and known app-side follow-ups.
