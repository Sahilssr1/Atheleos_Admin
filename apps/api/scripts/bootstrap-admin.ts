import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { loadEnv } from '../src/config/env.js';
import { createStore } from '../src/db/store.js';
import { nowIso } from '../src/utils/helpers.js';

// Creates the first Super Admin. Refuses to run when an admin already exists
// unless --force is passed. Credentials come only from BOOTSTRAP_ADMIN_* env.
async function main() {
  const cfg = loadEnv();
  const force = process.argv.includes('--force');
  const email = (cfg.BOOTSTRAP_ADMIN_EMAIL || '').toLowerCase().trim();
  const name = cfg.BOOTSTRAP_ADMIN_NAME || 'Super Admin';
  const password = cfg.BOOTSTRAP_ADMIN_PASSWORD || '';
  if (!email || !password) {
    console.error('BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be set in the environment.');
    process.exit(1);
  }
  if (password.length < 8) { console.error('Bootstrap password must be at least 8 characters.'); process.exit(1); }
  const store = createStore(cfg);
  const existing = await store.listDocs('admin_users', { limit: 1 });
  if (existing.length && !force) {
    console.error(`An admin already exists (${existing.length}+). Re-run with --force only if you intend to add another Super Admin.`);
    process.exit(1);
  }
  const dup = await store.listDocs('admin_users', { where: [{ field: 'email', op: '==', value: email }], limit: 1 });
  if (dup.length) { console.error('An admin with this email already exists.'); process.exit(1); }
  const hash = await bcrypt.hash(password, 12);
  const doc = await store.addDoc('admin_users', {
    email, name, role: 'super_admin', passwordHash: hash,
    mfaEnabled: false, mfaSecret: null, status: 'active', failedLogins: 0, lockedUntil: null,
    lastLoginAt: null, createdAt: nowIso(), updatedAt: nowIso(),
  });
  console.log(`Super Admin created: ${email} (id: ${doc.id}, data mode: ${cfg.DATA_MODE})`);
  console.log('Remove BOOTSTRAP_ADMIN_* from the environment now that bootstrap is complete.');
}
main().catch((e) => { console.error('Bootstrap failed:', e instanceof Error ? e.message : e); process.exit(1); });
