export function nowIso(): string { return new Date().toISOString(); }
export function str(v: unknown, fallback = ''): string {
  if (v === null || v === undefined) return fallback;
  return String(v);
}
export function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
export function bool(v: unknown): boolean { return v === true; }
export function isoOrNull(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}
export function pick(data: Record<string, unknown>, keys: string[], fallback: unknown = ''): unknown {
  for (const k of keys) if (data[k] !== undefined && data[k] !== null && data[k] !== '') return data[k];
  return fallback;
}
export function pagination(query: Record<string, unknown>): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(query.pageSize ?? '25'), 10) || 25));
  return { page, pageSize, offset: (page - 1) * pageSize };
}
export function paginate<T>(all: T[], page: number, pageSize: number): { items: T[]; page: number; pageSize: number; total: number } {
  const total = all.length;
  const items = all.slice((page - 1) * pageSize, page * pageSize);
  return { items, page, pageSize, total };
}
export interface Range { from: Date; to: Date; label: string }
export function parseRange(query: Record<string, unknown>): Range {
  const label = str(query.range, '30d');
  const now = new Date();
  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  if (label === 'custom' && query.from) {
    const from = new Date(String(query.from));
    const to = query.to ? new Date(String(query.to)) : now;
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) return { from, to, label };
  }
  if (label === 'today') return { from: startOfDay(now), to: now, label };
  const days = label === '7d' ? 7 : label === '90d' ? 90 : 30;
  const from = startOfDay(now); from.setDate(from.getDate() - (days - 1));
  return { from, to: now, label };
}
export function inRange(iso: string | null | undefined, range: Range): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t >= range.from.getTime() && t <= range.to.getTime() + 24 * 3600 * 1000;
}
export function dailySeries(dates: (string | null)[], range: Range): { date: string; count: number }[] {
  const map = new Map<string, number>();
  const cur = new Date(range.from); cur.setHours(0, 0, 0, 0);
  const end = new Date(range.to); end.setHours(0, 0, 0, 0);
  while (cur <= end) { map.set(cur.toISOString().slice(0, 10), 0); cur.setDate(cur.getDate() + 1); }
  for (const d of dates) {
    if (!d) continue;
    const key = new Date(d).toISOString().slice(0, 10);
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].map(([date, count]) => ({ date, count }));
}
export function isSecretKey(key: string): boolean {
  return /pass(word)?|secret|token|credential|private|api[-_]?key/i.test(key);
}
export function stripSecrets(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isSecretKey(k)) continue;
    out[k] = v;
  }
  return out;
}
