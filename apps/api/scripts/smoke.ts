import 'dotenv/config';
import { loadEnv } from '../src/config/env.js';
import { createStore } from '../src/db/store.js';

// Lightweight connectivity smoke check: store ping + config summary (no secrets printed).
async function main() {
  const cfg = loadEnv();
  const store = createStore(cfg);
  const ok = await store.ping().catch(() => false);
  console.log(JSON.stringify({
    dataMode: cfg.DATA_MODE,
    storeKind: store.kind,
    storePing: ok,
    firebaseConfigured: cfg.firebaseConfigured,
    smtpConfigured: cfg.smtpConfigured,
    imapConfigured: cfg.imapConfigured,
  }, null, 2));
  if (cfg.DATA_MODE === 'firestore' && !ok) process.exit(1);
}
main().catch((e) => { console.error('Smoke failed:', e instanceof Error ? e.message : e); process.exit(1); });
