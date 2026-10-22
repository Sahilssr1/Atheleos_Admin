import type { AppConfig } from '../config/env.js';

// Firebase Auth user management — active only in firestore mode with credentials.
// In memory mode (and when Firebase is unconfigured) these are safe no-ops so
// admin workflows still complete against the store.
export class FirebaseAuthService {
  constructor(private cfg: AppConfig) {}
  private async auth() {
    if (this.cfg.DATA_MODE !== 'firestore' || !this.cfg.firebaseConfigured) return null;
    try {
      const admin = await import('firebase-admin');
      if (!admin.apps.length) return null;
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
