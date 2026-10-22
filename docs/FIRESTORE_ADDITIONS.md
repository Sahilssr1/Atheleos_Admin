# Firestore additions to apply in `Sahilssr1/Atheleos_App`

The Admin API uses the Firebase Admin SDK, which bypasses Firestore security rules, so the panel
works without these changes. Apply them in the app repository to (a) keep client access least-privilege
and (b) make moderation/account flags take effect in the Flutter app.

## 1. Rules — deny client writes to admin-managed fields (add to `firestore.rules`)

In the `users/{uid}` rule, reject client updates that touch admin-managed fields:

```
function touchesAdminFields() {
  return request.resource.data.diff(resource.data).affectedKeys()
    .hasAny(['accountStatus','accountStatusReason','accountStatusAt','accountStatusBy',
             'accountStatusExpiresAt','verified','verificationStatus','verificationBadge',
             'verificationLevel','verificationDate','verificationRejectedReason']);
}
// in the users update rule: allow update: if isOwner(uid) && !touchesAdminFields() ...
```

In `posts/{postId}`, `stories/{storyId}`, `events/{eventId}` and `posts/{postId}/comments/{commentId}`,
likewise reject client changes to `moderationStatus`, `moderatedBy`, `moderatedAt`, `moderationReason`.

Add explicit deny-all client rules for the admin-owned collections (Admin SDK is unaffected):

```
match /admin_users/{id}            { allow read, write: if false; }
match /admin_sessions/{id}         { allow read, write: if false; }
match /admin_login_events/{id}     { allow read, write: if false; }
match /admin_audit_logs/{id}       { allow read, write: if false; }
match /moderation_cases/{id}       { allow read, write: if false; }
match /admin_notification_jobs/{id} { allow read, write: if false; }
match /admin_email_drafts/{id}     { allow read, write: if false; }
match /admin_password_resets/{id}  { allow read, write: if false; }
match /admin_config/{id}           { allow read, write: if false; }
match /appeals/{id} {
  allow create: if request.auth != null
    && request.resource.data.userId == request.auth.uid
    && request.resource.data.status == 'pending';
  allow read: if request.auth != null && resource.data.userId == request.auth.uid;
  allow update, delete: if false; // decisions are server-side only
}
```

## 2. App behaviour — honour admin flags in the Flutter client

- Feed/explore/profile post queries: exclude docs where `moderationStatus in ('hidden','removed')`
  or `deleted == true` (the latter already exists).
- Story tray: same exclusion; comments: exclude `moderationStatus in ('hidden','removed')`.
- Auth/session check after login: if `accountStatus == 'suspended' | 'deleted'`, sign the user out
  with the stored `accountStatusReason`; if `'restricted'`, disable the actions listed in
  `accountRestrictions` (posting/commenting/messaging) client-side. (The strongest enforcement is
  the Firebase Auth disable the API already performs for suspend/delete.)

## 3. Indexes — add to `firestore.indexes.json` in the app repo

```json
[
  { "collectionGroup": "verification_applications", "queryScope": "COLLECTION_GROUP",
    "fields": [{ "fieldPath": "status", "order": "ASCENDING" }, { "fieldPath": "submittedAt", "order": "DESCENDING" }] },
  { "collectionGroup": "comments", "queryScope": "COLLECTION_GROUP",
    "fields": [{ "fieldPath": "createdAt", "order": "DESCENDING" }] },
  { "collectionGroup": "users", "queryScope": "COLLECTION",
    "fields": [{ "fieldPath": "accountStatus", "order": "ASCENDING" }, { "fieldPath": "createdAt", "order": "DESCENDING" }] },
  { "collectionGroup": "reports", "queryScope": "COLLECTION",
    "fields": [{ "fieldPath": "status", "order": "ASCENDING" }, { "fieldPath": "createdAt", "order": "DESCENDING" }] },
  { "collectionGroup": "posts", "queryScope": "COLLECTION",
    "fields": [{ "fieldPath": "type", "order": "ASCENDING" }, { "fieldPath": "createdAt", "order": "DESCENDING" }] }
]
```
(The same file is provided machine-ready at `docs/firestore.indexes.additions.json`.)
