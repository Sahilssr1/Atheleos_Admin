import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import type { MetricValue } from '@atheleos/shared';
import {
  AlertTriangle, BadgeCheck, Bell, ChevronLeft, ChevronRight, FileText, Flag, Image as ImageIcon,
  Inbox, KeyRound, LifeBuoy, Lock, Mail, MessageCircle, MessageSquare, Moon, Scale, ScrollText,
  Search, Send, Settings2, ShieldCheck, Sun, UserCog, Users, type LucideIcon,
} from 'lucide-react';
import { ApiError } from '../lib/api';
import { fmtNum, initials, statusTone } from '../lib/format';

// ── Button ───────────────────────────────────────────────────
type BtnVariant = 'primary' | 'default' | 'ghost' | 'danger' | 'danger-outline';
export function Button({ variant = 'default', size, className = '', ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' }) {
  const cls = ['btn', variant !== 'default' ? variant : '', size === 'sm' ? 'sm' : '', className].filter(Boolean).join(' ');
  return <button className={cls} {...props} />;
}

// ── Card ─────────────────────────────────────────────────────
export function Card({ children, className = '', flush, style }: { children: ReactNode; className?: string; flush?: boolean; style?: React.CSSProperties }) {
  return <div className={`card${flush ? ' flush' : ''} ${className}`} style={style}>{children}</div>;
}

// ── Badge ────────────────────────────────────────────────────
export function Badge({ tone = 'default', children }: { tone?: 'ok' | 'danger' | 'warn' | 'info' | 'default' | 'grad'; children: ReactNode }) {
  return <span className={`badge${tone !== 'default' ? ` ${tone}` : ''}`}>{children}</span>;
}
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{status.replace(/_/g, ' ')}</Badge>;
}

// ── Avatar ───────────────────────────────────────────────────
export function Avatar({ src, name, size = 36 }: { src?: string; name: string; size?: number }) {
  if (src) return <img className="avatar" src={src} alt="" width={size} height={size} loading="lazy" />;
  return <span className="avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>{initials(name)}</span>;
}

// ── Skeleton ─────────────────────────────────────────────────
export function Skeleton({ width = '100%', height = 16, style }: { width?: string | number; height?: number; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ width, height, ...style }} aria-hidden />;
}
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }} aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="row">
          {Array.from({ length: cols }).map((_, c) => <Skeleton key={c} height={14} />)}
        </div>
      ))}
    </div>
  );
}
export function CardSkeleton() {
  return <Card><Skeleton height={14} width="55%" /><div style={{ height: 8 }} /><Skeleton height={28} width="40%" /></Card>;
}

// ── States ───────────────────────────────────────────────────
/** Legacy emoji icon names from page call-sites, rendered as Lucide icons. */
const EMPTY_STATE_ICONS: Record<string, LucideIcon> = {
  '📭': Inbox, '📥': Inbox, '📤': Send, '⚖️': Scale, '✅': BadgeCheck, '✉️': Mail,
  '🎧': LifeBuoy, '👥': Users, '💬': MessageCircle, '💭': MessageSquare, '📜': ScrollText,
  '📝': FileText, '🔍': Search, '🔐': Lock, '🔑': KeyRound, '🔔': Bell,
  '🖼️': ImageIcon, '🚩': Flag, '🛡️': ShieldCheck, '🧑‍💼': UserCog,
};

export function EmptyState({ icon = '📭', title, hint, action }: { icon?: string; title: string; hint?: string; action?: ReactNode }) {
  const Icon = EMPTY_STATE_ICONS[icon];
  return (
    <div className="state-box">
      <div className="state-icon" aria-hidden>{Icon ? <Icon /> : <span className="state-emoji">{icon}</span>}</div>
      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{title}</div>
      {hint && <div className="small" style={{ marginTop: 4 }}>{hint}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error instanceof ApiError && error.isConfigError) {
    return <ConfigRequired code={error.code} message={error.message} />;
  }
  const msg = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <div className="state-box">
      <div className="state-icon" aria-hidden><AlertTriangle /></div>
      <div style={{ fontWeight: 600, color: 'var(--text)' }}>Could not load this data</div>
      <div className="small" style={{ marginTop: 4 }}>{msg}</div>
      {onRetry && <div style={{ marginTop: 12 }}><Button onClick={onRetry}>Retry</Button></div>}
    </div>
  );
}

/** Shown when the API reports an integration is not configured — never fake data. */
export function ConfigRequired({ code, message }: { code?: string; message?: string }) {
  return (
    <div className="config-box" role="alert">
      <h3><Settings2 aria-hidden /> Configuration required</h3>
      <p style={{ margin: '4px 0' }}>
        {message ?? 'This integration is not configured on the admin API server.'}
      </p>
      <p className="small muted" style={{ margin: 0 }}>
        {code ? <span className="mono">{code}</span> : null} — set the required environment variables on the API
        (see <span className="mono">apps/api/.env.example</span>) and restart it. No data is shown until the
        integration is connected.
      </p>
    </div>
  );
}

// ── Pagination ───────────────────────────────────────────────
export function Pagination({ page, pageSize, total, onPage }: {
  page: number; pageSize: number; total: number | null; onPage: (p: number) => void;
}) {
  const hasNext = total !== null ? page * pageSize < total : true;
  return (
    <div className="pagination">
      <span className="small muted">
        Page {page}{total !== null ? ` of ${Math.max(1, Math.ceil(total / pageSize))} · ${fmtNum(total)} total` : ''}
      </span>
      <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft aria-hidden /> Prev</Button>
      <Button size="sm" disabled={!hasNext} onClick={() => onPage(page + 1)}>Next <ChevronRight aria-hidden /></Button>
    </div>
  );
}

// ── Search input ─────────────────────────────────────────────
export function SearchInput({ placeholder = 'Search…', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div style={{ position: 'relative' }}>
      <span aria-hidden style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', display: 'inline-flex' }}>
        <Search style={{ width: 16, height: 16 }} />
      </span>
      <input className="input" style={{ paddingLeft: 34 }} placeholder={placeholder} {...props} />
    </div>
  );
}

// ── Stat card (MetricValue-aware) ────────────────────────────
export function StatCard({ label, metric, note, icon: Icon }: {
  label: string; metric: MetricValue | undefined; note?: string; icon?: LucideIcon;
}) {
  return (
    <Card className="stat-card">
      <span className="stat-top">
        <span className="stat-label">{label}</span>
        {Icon && <span className="stat-icon" aria-hidden><Icon /></span>}
      </span>
      {metric && metric.available && metric.value !== null
        ? <span className="stat-value">{fmtNum(metric.value)}</span>
        : <span className="stat-value" style={{ fontSize: 17, color: 'var(--text-faint)' }}>Not available</span>}
      {(note ?? metric?.note) && <span className="stat-note">{note ?? metric?.note}</span>}
    </Card>
  );
}

// ── Theme toggle ─────────────────────────────────────────────
export function ThemeToggle() {
  const [theme, setTheme] = useState<string>(
    () => (typeof document !== 'undefined' ? document.documentElement.dataset.theme ?? 'dark' : 'dark'),
  );
  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('atheleos-theme', next); } catch { /* ignore */ }
    setTheme(next);
  };
  return (
    <button className="icon-btn" onClick={toggle} aria-label="Toggle dark / light theme" title="Toggle theme">
      {theme === 'light' ? <Moon /> : <Sun />}
    </button>
  );
}
