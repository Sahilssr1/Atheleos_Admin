import type { AppConfig } from '../config/env.js';
import { cleanPrivateKey } from './store.js';

// Firebase Auth user management — active only in firestore mode with credentials.
// In memory mode (and when Firebase is unconfigured) these are safe no-ops so
// admin workflows still complete against the store.
export class FirebaseAuthService {
  constructor(private cfg: AppConfig) {}
  private async auth() {
    if (this.cfg.DATA_MODE !== 'firestore' || !this.cfg.firebaseConfigured) return null;
    try {
      const fbAdminMod = await import('firebase-admin');
      const admin = (fbAdminMod as any).default ?? fbAdminMod;
      if (!admin.apps.length) {
        const opts: Record<string, unknown> = { projectId: this.cfg.FIREBASE_PROJECT_ID };
        if (this.cfg.FIREBASE_SERVICE_ACCOUNT_JSON) {
          opts.credential = admin.credential.cert(JSON.parse(this.cfg.FIREBASE_SERVICE_ACCOUNT_JSON));
        } else if (this.cfg.FIREBASE_CLIENT_EMAIL && this.cfg.FIREBASE_PRIVATE_KEY) {
          opts.credential = admin.credential.cert({
            projectId: this.cfg.FIREBASE_PROJECT_ID,
            clientEmail: this.cfg.FIREBASE_CLIENT_EMAIL,
            privateKey: cleanPrivateKey(this.cfg.FIREBASE_PRIVATE_KEY),
          });
        } else if (this.cfg.GOOGLE_APPLICATION_CREDENTIALS) {
          opts.credential = admin.credential.applicationDefault();
        }
        admin.initializeApp(opts);
      }
      return admin.auth();
    } catch { return null; }
  }
  async disableUser(uid: string): Promise<void> {
    const a = await this.auth(); if (!a) return;
    try { await a.updateUser(uid, { disabled: true }); } catch { /* user may not exist in Auth */ }
  }
  async enableUser(uid: string): Promise<void> {
    const a = await this.auth(); if (!a) return;
    try { await a.updateUser(uid, { disabled: false }); } catch { /* noop */ }
  }
  async deleteUser(uid: string): Promise<void> {
    const a = await this.auth(); if (!a) return;
    try { await a.deleteUser(uid); } catch { /* noop */ }
  }
}
