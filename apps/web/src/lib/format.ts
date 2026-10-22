export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function fmtDateOnly(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtDateOnly(iso);
}

export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString();
}

export function initials(name: string): string {
  const parts = (name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** Human countdown until an ISO timestamp (for story expiry). */
export function countdown(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return '';
  if (ms <= 0) return 'Expired';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m left`;
  return `${Math.floor(hrs / 24)}d left`;
}

/** Status → badge tone shared across pages. */
export function statusTone(status: string): 'ok' | 'danger' | 'warn' | 'info' | 'default' {
  switch (status) {
    case 'active': case 'visible': case 'approved': case 'resolved': case 'closed':
    case 'action_taken': case 'delivered': case 'ok': case 'success':
      return 'ok';
    case 'suspended': case 'removed': case 'rejected': case 'failed': case 'error': case 'deleted':
      return 'danger';
    case 'restricted': case 'hidden': case 'pending': case 'new': case 'open': case 'escalated': case 'urgent':
      return 'warn';
    case 'under_review': case 'underReview': case 'appealed': case 'in_progress':
      return 'info';
    default:
      return 'default';
  }
}

export function humanize(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
