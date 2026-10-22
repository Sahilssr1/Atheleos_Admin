import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Permission } from '@atheleos/shared';
import { ROLE_LABELS } from '@atheleos/shared';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { normalizeSearch, searchHref, type NotificationJob, type SearchGroup } from '../lib/types';
import { useDebounced } from '../hooks/useFetch';
import { Avatar, ThemeToggle } from '../components/ui';
import type { Paginated } from '@atheleos/shared';

interface NavItem { to: string; label: string; icon: string; permission?: Permission }
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', icon: '🏠', permission: 'dashboard.view' },
  { to: '/users', label: 'Users', icon: '👥', permission: 'users.view' },
  { to: '/verifications', label: 'Verification', icon: '✅', permission: 'users.verify' },
  { to: '/content', label: 'Content', icon: '🖼️', permission: 'content.view' },
  { to: '/moderation', label: 'Moderation', icon: '🛡️', permission: 'moderation.view' },
  { to: '/reports', label: 'Reports & Appeals', icon: '🚩', permission: 'reports.view' },
  { to: '/messages', label: 'Direct Messages', icon: '💬', permission: 'messages.view' },
  { to: '/email', label: 'Email Center', icon: '✉️', permission: 'email.view' },
  { to: '/comments', label: 'Comments', icon: '💭', permission: 'content.view' },
  { to: '/stories', label: 'Stories & Reels', icon: '🎞️', permission: 'content.view' },
  { to: '/notifications', label: 'Notifications', icon: '🔔', permission: 'notifications.view' },
  { to: '/support', label: 'Support Tickets', icon: '🎧', permission: 'support.view' },
  { to: '/analytics', label: 'Analytics', icon: '📊', permission: 'analytics.view' },
  { to: '/admins', label: 'Admin Team', icon: '🧑‍💼', permission: 'admins.manage' },
  { to: '/roles', label: 'Roles & Permissions', icon: '🔑', permission: 'roles.manage' },
  { to: '/audit', label: 'Audit Logs', icon: '📜', permission: 'audit.view' },
  { to: '/settings', label: 'Platform Settings', icon: '⚙️', permission: 'settings.manage' },
  { to: '/security', label: 'Security Center', icon: '🔐', permission: 'security.view' },
  { to: '/health', label: 'System Health', icon: '💚', permission: 'system.view' },
];

const TITLES: Record<string, string> = Object.fromEntries(NAV_ITEMS.map((n) => [n.to, n.label]));

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [searching, setSearching] = useState(false);
  const debounced = useDebounced(q, 300);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (debounced.trim().length < 2) { setGroups([]); return; }
    let cancelled = false;
    setSearching(true);
    api.get(`/search?q=${encodeURIComponent(debounced.trim())}`)
      .then((d) => { if (!cancelled) { setGroups(normalizeSearch(d as never)); setOpen(true); } })
      .catch(() => { if (!cancelled) setGroups([]); })
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [debounced]);

  const go = (href: string) => { setOpen(false); setQ(''); navigate(href); };

  return (
    <div className="search-wrap" ref={ref}>
      <form
        role="search"
        onSubmit={(e) => { e.preventDefault(); if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`); }}
      >
        <span aria-hidden style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }}>🔍</span>
        <input
          className="input" style={{ paddingLeft: 32 }} placeholder="Search users, content, reports, tickets…"
          value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => groups.length && setOpen(true)}
          aria-label="Global search"
        />
      </form>
      {open && (
        <div className="search-results">
          {searching && <div className="small muted" style={{ padding: 8 }}>Searching…</div>}
          {!searching && groups.length === 0 && <div className="small muted" style={{ padding: 8 }}>No results for “{q}”.</div>}
          {groups.map((g) => (
            <div key={g.kind}>
              <div className="group-label">{g.label ?? g.kind}</div>
              {g.items.slice(0, 6).map((it) => (
                <button key={`${g.kind}-${it.id}`} className="search-result-item"
                  onClick={() => go(it.href ?? searchHref(g.kind, it.id))}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
                    {it.subtitle && <span className="small faint" style={{ display: 'block' }}>{it.subtitle}</span>}
                  </span>
                </button>
              ))}
            </div>
          ))}
          {groups.length > 0 && (
            <button className="search-result-item" onClick={() => go(`/search?q=${encodeURIComponent(q.trim())}`)}>
              <span className="small">See all results →</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<NotificationJob[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { hasPermission } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (!open || loaded || !hasPermission('notifications.view')) return;
    api.get<Paginated<NotificationJob>>('/notifications/jobs?page=1&pageSize=6')
      .then((d) => setJobs(d.items))
      .catch(() => setJobs([]))
      .finally(() => setLoaded(true));
  }, [open, loaded, hasPermission]);

  if (!hasPermission('notifications.view')) return null;
  return (
    <div className="dropdown" ref={ref}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Recent notification broadcasts" title="Recent broadcasts">
        🔔{jobs.length > 0 && <span className="dot" />}
      </button>
      {open && (
        <div className="dropdown-menu" style={{ minWidth: 300 }}>
          <div className="small" style={{ fontWeight: 700, padding: '6px 10px' }}>Recent broadcasts</div>
          {jobs.length === 0 && <div className="small muted" style={{ padding: '6px 10px' }}>No broadcasts sent yet.</div>}
          {jobs.map((j) => (
            <button key={j.id} onClick={() => { setOpen(false); navigate('/notifications'); }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title}</span>
                <span className="small faint">{j.createdAt ? new Date(j.createdAt).toLocaleString() : ''}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  if (!user) return null;
  return (
    <div className="dropdown" ref={ref}>
      <button className="icon-btn" style={{ padding: 2 }} onClick={() => setOpen((o) => !o)} aria-label="Administrator menu">
        <Avatar name={user.name} size={32} />
      </button>
      {open && (
        <div className="dropdown-menu">
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
            <div style={{ fontWeight: 700 }}>{user.name}</div>
            <div className="small muted">{user.email}</div>
            <div className="small faint">{ROLE_LABELS[user.role]}</div>
          </div>
          <button onClick={() => { setOpen(false); navigate('/security'); }}>🔐 Security & MFA setup</button>
          <button onClick={() => { setOpen(false); navigate('/settings'); }}>⚙️ Platform settings</button>
          <button onClick={async () => { setOpen(false); await logout(); navigate('/login'); }}>🚪 Log out</button>
        </div>
      )}
    </div>
  );
}

export default function AppLayout({ children }: { children?: ReactNode }) {
  const { user, hasPermission } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  const visible = NAV_ITEMS.filter((n) => !n.permission || hasPermission(n.permission));
  const base = '/' + (location.pathname.split('/')[1] ?? '');
  const title = TITLES[location.pathname] ?? TITLES[base] ?? 'Atheleos Admin';

  return (
    <div className="shell">
      {drawer && <div className="sidebar-backdrop" onClick={() => setDrawer(false)} />}
      <aside className={`sidebar${drawer ? ' open' : ''}`} aria-label="Admin navigation">
        <div className="brand">
          <img src="/atheleos.png" alt="Atheleos" className="brand-logo-img" />
          <span>
            <span className="brand-name">Atheleos</span>
            <span className="brand-sub" style={{ display: 'block' }}>Admin Panel</span>
          </span>
        </div>
        <nav>
          {visible.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              onClick={() => setDrawer(false)}>
              <span className="nav-icon" aria-hidden>{n.icon}</span>
              <span className="nav-label">{n.label}</span>
            </NavLink>
          ))}
        </nav>
        {user && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }} className="small muted">
            <span className="nav-label">{user.name} · {ROLE_LABELS[user.role]}</span>
          </div>
        )}
      </aside>
      <div className="main-col">
        <header className="topbar">
          <button className="icon-btn hamburger" onClick={() => setDrawer(true)} aria-label="Open navigation">☰</button>
          <div style={{ fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          <div className="spacer" />
          <GlobalSearch />
          <ThemeToggle />
          <NotificationsBell />
          <ProfileMenu />
        </header>
        <main style={{ flex: 1, minWidth: 0 }}>
          {children ?? <Outlet />}
        </main>
        <footer className="small faint" style={{ padding: '10px 24px', borderTop: '1px solid var(--border)' }}>
          Atheleos Admin · <Link to="/health">System health</Link> · All administrative actions are audit-logged.
        </footer>
      </div>
    </div>
  );
}
