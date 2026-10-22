import { ConfigError } from '../utils/errors.js';
import type { AppConfig } from '../config/env.js';

export type WhereOp = '==' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'array-contains';
export interface WhereClause { field: string; op: WhereOp; value: unknown }
export interface ListOptions {
  where?: WhereClause[];
  orderBy?: { field: string; dir: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
}
export interface DocResult { id: string; path: string; data: Record<string, unknown> }

export interface Store {
  kind: 'firestore' | 'memory' | 'unavailable';
  getDoc(path: string): Promise<DocResult | null>;
  listDocs(collectionPath: string, opts?: ListOptions): Promise<DocResult[]>;
  collectionGroup(name: string, opts?: ListOptions): Promise<DocResult[]>;
  addDoc(collectionPath: string, data: Record<string, unknown>): Promise<DocResult>;
  setDoc(path: string, data: Record<string, unknown>, merge?: boolean): Promise<DocResult>;
  updateDoc(path: string, data: Record<string, unknown>): Promise<DocResult>;
  deleteDoc(path: string): Promise<void>;
  ping(): Promise<boolean>;
}

export async function countViaList(store: Store, collectionPath: string, opts?: ListOptions): Promise<number> {
  const docs = await store.listDocs(collectionPath, { ...opts, limit: opts?.limit ?? 100000, offset: 0 });
  return docs.length;
}

export function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const sa = String(a); const sb = String(b);
  return sa < sb ? -1 : 1;
}

export function matchWhere(data: Record<string, unknown>, clauses: WhereClause[] = []): boolean {
  for (const c of clauses) {
    const v = getField(data, c.field);
    switch (c.op) {
      case '==': if (!(v === c.value || String(v) === String(c.value))) return false; break;
      case '!=': if (v === c.value) return false; break;
      case '>': if (!(compareValues(v, c.value) > 0)) return false; break;
      case '>=': if (!(compareValues(v, c.value) >= 0)) return false; break;
      case '<': if (!(compareValues(v, c.value) < 0)) return false; break;
      case '<=': if (!(compareValues(v, c.value) <= 0)) return false; break;
      case 'in': if (!Array.isArray(c.value) || !c.value.some((x) => x === v || String(x) === String(v))) return false; break;
      case 'array-contains': if (!Array.isArray(v) || !v.some((x) => x === c.value || String(x) === String(c.value))) return false; break;
      default: return false;
    }
  }
  return true;
}

export function getField(data: Record<string, unknown>, field: string): unknown {
  if (field.includes('.')) {
    let cur: unknown = data;
    for (const part of field.split('.')) {
      if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[part];
      else return undefined;
    }
    return cur;
  }
  return data[field];
}

export function applyListOpts(docs: DocResult[], opts: ListOptions = {}): DocResult[] {
  let out = docs.filter((d) => matchWhere(d.data, opts.where));
  if (opts.orderBy) {
    const { field, dir } = opts.orderBy;
    out = [...out].sort((a, b) => {
      const c = compareValues(getField(a.data, field), getField(b.data, field));
      return dir === 'desc' ? -c : c;
    });
  }
  const offset = opts.offset ?? 0;
  if (offset) out = out.slice(offset);
  if (opts.limit !== undefined) out = out.slice(0, opts.limit);
  return out;
}

function clone<T>(v: T): T { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
let memCounter = 0;
function newId(): string { memCounter += 1; return `doc_${Date.now().toString(36)}_${memCounter}_${Math.random().toString(36).slice(2, 8)}`; }
function splitPath(path: string): string[] { return path.split('/').filter(Boolean); }
function docId(path: string): string { const s = splitPath(path); return s[s.length - 1]; }
function parentPath(path: string): string { const s = splitPath(path); return s.slice(0, -1).join('/'); }

export class MemoryStore implements Store {
  kind = 'memory' as const;
  docs = new Map<string, Record<string, unknown>>();
  constructor(seed?: Record<string, Record<string, unknown>>) {
    if (seed) for (const [k, v] of Object.entries(seed)) this.docs.set(k, clone(v));
  }
  async getDoc(path: string): Promise<DocResult | null> {
    const data = this.docs.get(path);
    if (!data) return null;
    return { id: docId(path), path, data: clone(data) };
  }
  async listDocs(collectionPath: string, opts: ListOptions = {}): Promise<DocResult[]> {
    const out: DocResult[] = [];
    for (const [path, data] of this.docs.entries()) {
      if (parentPath(path) === collectionPath) out.push({ id: docId(path), path, data: clone(data) });
    }
    return applyListOpts(out, opts);
  }
  async collectionGroup(name: string, opts: ListOptions = {}): Promise<DocResult[]> {
    const out: DocResult[] = [];
    for (const [path, data] of this.docs.entries()) {
      const parent = parentPath(path);
      const segs = parent.split('/').filter(Boolean);
      if (segs[segs.length - 1] === name) out.push({ id: docId(path), path, data: clone(data) });
    }
    return applyListOpts(out, opts);
  }
  async addDoc(collectionPath: string, data: Record<string, unknown>): Promise<DocResult> {
    const id = newId();
    const path = `${collectionPath}/${id}`;
    this.docs.set(path, clone(data));
    return { id, path, data: clone(data) };
  }
  async setDoc(path: string, data: Record<string, unknown>, merge = false): Promise<DocResult> {
    const existing = this.docs.get(path);
    const next = merge && existing ? { ...clone(existing), ...clone(data) } : clone(data);
    this.docs.set(path, next);
    return { id: docId(path), path, data: clone(next) };
  }
  async updateDoc(path: string, data: Record<string, unknown>): Promise<DocResult> {
    const existing = this.docs.get(path);
    if (!existing) throw Object.assign(new Error(`Document not found: ${path}`), { code: 'NOT_FOUND', status: 404 });
    const next = { ...clone(existing), ...clone(data) };
    this.docs.set(path, next);
    return { id: docId(path), path, data: clone(next) };
  }
  async deleteDoc(path: string): Promise<void> { this.docs.delete(path); }
  async ping(): Promise<boolean> { return true; }
  // test helper
  seed(path: string, data: Record<string, unknown>) { this.docs.set(path, clone(data)); }
}

// ── Firestore ────────────────────────────────────────────────────────────────
function serializeValue(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === 'object') {
    const anyV = v as { toDate?: () => Date; _seconds?: number };
    if (typeof anyV.toDate === 'function') return anyV.toDate().toISOString();
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(serializeValue);
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = serializeValue(val);
    return out;
  }
  return v;
}
export function serializeDoc(data: Record<string, unknown>): Record<string, unknown> {
  return serializeValue(data) as Record<string, unknown>;
}

export class FirestoreStore implements Store {
  kind = 'firestore' as const;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private dbPromise: Promise<any> | null = null;
  constructor(private cfg: AppConfig) {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async db(): Promise<any> {
    if (!this.dbPromise) {
      this.dbPromise = (async () => {
        if (!this.cfg.FIREBASE_PROJECT_ID) throw new ConfigError('FIREBASE_PROJECT_ID is not set');
        const hasCreds = Boolean(this.cfg.GOOGLE_APPLICATION_CREDENTIALS || this.cfg.FIREBASE_SERVICE_ACCOUNT_JSON || this.cfg.FIRESTORE_EMULATOR_HOST);
        if (!hasCreds) throw new ConfigError('Firebase credentials are not configured');
        const admin = await import('firebase-admin');
        if (!admin.apps.length) {
          const opts: Record<string, unknown> = { projectId: this.cfg.FIREBASE_PROJECT_ID };
          if (this.cfg.FIREBASE_SERVICE_ACCOUNT_JSON) {
            opts.credential = admin.credential.cert(JSON.parse(this.cfg.FIREBASE_SERVICE_ACCOUNT_JSON));
          } else if (this.cfg.GOOGLE_APPLICATION_CREDENTIALS) {
            opts.credential = admin.credential.applicationDefault();
          }
          admin.initializeApp(opts);
        }
        return admin.firestore();
      })();
    }
    return this.dbPromise;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async applyQuery(q: any, opts: ListOptions = {}): Promise<any> {
    let query = q;
    for (const w of opts.where ?? []) query = query.where(w.field, w.op, w.value);
    if (opts.orderBy) query = query.orderBy(opts.orderBy.field, opts.orderBy.dir);
    if (opts.offset) query = query.offset(opts.offset);
    if (opts.limit !== undefined) query = query.limit(opts.limit);
    return query;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toResult(snap: any): DocResult {
    return { id: snap.id, path: snap.ref.path, data: serializeDoc(snap.data() ?? {}) };
  }
  async getDoc(path: string): Promise<DocResult | null> {
    const db = await this.db();
    const snap = await db.doc(path).get();
    if (!snap.exists) return null;
    return this.toResult(snap);
  }
  async listDocs(collectionPath: string, opts: ListOptions = {}): Promise<DocResult[]> {
    const db = await this.db();
    const q = await this.applyQuery(db.collection(collectionPath), opts);
    const snap = await q.get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return snap.docs.map((d: any) => this.toResult(d));
  }
  async collectionGroup(name: string, opts: ListOptions = {}): Promise<DocResult[]> {
    const db = await this.db();
    const q = await this.applyQuery(db.collectionGroup(name), opts);
    const snap = await q.get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return snap.docs.map((d: any) => this.toResult(d));
  }
  async addDoc(collectionPath: string, data: Record<string, unknown>): Promise<DocResult> {
    const db = await this.db();
    const ref = await db.collection(collectionPath).add(data);
    const snap = await ref.get();
    return this.toResult(snap);
  }
  async setDoc(path: string, data: Record<string, unknown>, merge = false): Promise<DocResult> {
    const db = await this.db();
    await db.doc(path).set(data, { merge });
    const snap = await db.doc(path).get();
    return this.toResult(snap);
  }
  async updateDoc(path: string, data: Record<string, unknown>): Promise<DocResult> {
    const db = await this.db();
    await db.doc(path).update(data);
    const snap = await db.doc(path).get();
    return this.toResult(snap);
  }
  async deleteDoc(path: string): Promise<void> {
    const db = await this.db();
    await db.doc(path).delete();
  }
  async ping(): Promise<boolean> {
    try { const db = await this.db(); await db.collection('admin_config').limit(1).get(); return true; } catch { return false; }
  }
}

export class UnavailableStore implements Store {
  kind = 'unavailable' as const;
  private err(): ConfigError { return new ConfigError(); }
  async getDoc(): Promise<DocResult | null> { throw this.err(); }
  async listDocs(): Promise<DocResult[]> { throw this.err(); }
  async collectionGroup(): Promise<DocResult[]> { throw this.err(); }
  async addDoc(): Promise<DocResult> { throw this.err(); }
  async setDoc(): Promise<DocResult> { throw this.err(); }
  async updateDoc(): Promise<DocResult> { throw this.err(); }
  async deleteDoc(): Promise<void> { throw this.err(); }
  async ping(): Promise<boolean> { return false; }
}

export function createStore(cfg: AppConfig): Store {
  if (cfg.DATA_MODE === 'memory') return new MemoryStore();
  if (!cfg.firebaseConfigured) return new UnavailableStore();
  return new FirestoreStore(cfg);
}
