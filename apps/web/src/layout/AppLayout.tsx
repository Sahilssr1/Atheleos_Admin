import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Permission } from '@atheleos/shared';
import { ROLE_LABELS } from '@atheleos/shared';
import {
  BadgeCheck, Bell, ChevronDown, Film, Flag, HeartPulse, Image as ImageIcon, KeyRound,
  LayoutDashboard, LifeBuoy, Lock, LogOut, Mail, Menu, MessageCircle, MessageSquare,
  PanelLeftClose, PanelLeftOpen, PieChart, ScrollText, Search, Settings, ShieldCheck,
  UserCog, Users, type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { normalizeSearch, searchHref, type NotificationJob, type SearchGroup } from '../lib/types';
import { useDebounced } from '../hooks/useFetch';
import { Avatar, ThemeToggle } from '../components/ui';
import type { Paginated } from '@atheleos/shared';

interface NavItem { to: string; label: string; icon: LucideIcon; permission?: Permission; group?: string }
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, permission: 'dashboard.view' },
  { to: '/users', label: 'Users', icon: Users, permission: 'users.view', group: 'Manage' },
  { to: '/verifications', label: 'Verification', icon: BadgeCheck, permission: 'users.verify', group: 'Manage' },
  { to: '/content', label: 'Content', icon: ImageIcon, permission: 'content.view', group: 'Manage' },
  { to: '/comments', label: 'Comments', icon: MessageSquare, permission: 'content.view', group: 'Manage' },
  { to: '/stories', label: 'Stories & Reels', icon: Film, permission: 'content.view', group: 'Manage' },
  { to: '/moderation', label: 'Moderation', icon: ShieldCheck, permission: 'moderation.view', group: 'Trust & Safety' },
  { to: '/reports', label: 'Reports & Appeals', icon: Flag, permission: 'reports.view', group: 'Trust & Safety' },
  { to: '/messages', label: 'Direct Messages', icon: MessageCircle, permission: 'messages.view', group: 'Communication' },
  { to: '/email', label: 'Email Center', icon: Mail, permission: 'email.view', group: 'Communication' },
  { to: '/notifications', label: 'Notifications', icon: Bell, permission: 'notifications.view', group: 'Communication' },
  { to: '/support', label: 'Support Tickets', icon: LifeBuoy, permission: 'support.view', group: 'Communication' },
  { to: '/analytics', label: 'Analytics', icon: PieChart, permission: 'analytics.view', group: 'Insights' },
  { to: '/admins', label: 'Admin Team', icon: UserCog, permission: 'admins.manage', group: 'Administration' },
  { to: '/roles', label: 'Roles & Permissions', icon: KeyRound, permission: 'roles.manage', group: 'Administration' },
  { to: '/audit', label: 'Audit Logs', icon: ScrollText, permission: 'audit.view', group: 'Administration' },
  { to: '/settings', label: 'Platform Settings', icon: Settings, permission: 'settings.manage', group: 'Administration' },
  { to: '/security', label: 'Security Center', icon: Lock, permission: 'security.view', group: 'Administration' },
  { to: '/health', label: 'System Health', icon: HeartPulse, permission: 'system.view', group: 'Administration' },
];
const NAV_GROUPS = ['Manage', 'Trust & Safety', 'Communication', 'Insights', 'Administration'];

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
        <span className="search-ico" aria-hidden><Search /></span>
        <input
          className="input" style={{ paddingLeft: 34 }} placeholder="Search users, content, reports, tickets…"
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
        <Bell />{jobs.length > 0 && <span className="dot" />}
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
      <button className="icon-btn" style={{ padding: 2, width: 'auto', height: 'auto', borderRadius: '50%' }} onClick={() => setOpen((o) => !o)} aria-label="Administrator menu">
        <Avatar name={user.name} size={33} />
      </button>
      {open && (
        <div className="dropdown-menu">
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-soft)', marginBottom: 4 }}>
            <div style={{ fontWeight: 700 }}>{user.name}</div>
            <div className="small muted">{user.email}</div>
            <div className="small faint">{ROLE_LABELS[user.role]}</div>
          </div>
          <button onClick={() => { setOpen(false); navigate('/security'); }}><Lock /> Security & MFA setup</button>
          <button onClick={() => { setOpen(false); navigate('/settings'); }}><Settings /> Platform settings</button>
          <button onClick={async () => { setOpen(false); await logout(); navigate('/login'); }}><LogOut /> Log out</button>
        </div>
      )}
    </div>
  );
}

function readBool(key: string, fallback: boolean): boolean {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v === '1'; } catch { return fallback; }
}
function readGroups(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem('atheleos-nav-groups') ?? '{}') as Record<string, boolean>; } catch { return {}; }
}

export default function AppLayout({ children }: { children?: ReactNode }) {
  const { user, hasPermission } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => readBool('atheleos-nav-collapsed', false));
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>(readGroups);
  const location = useLocation();
  const visible = NAV_ITEMS.filter((n) => !n.permission || hasPermission(n.permission));
  const standalone = visible.filter((n) => !n.group);
  const base = '/' + (location.pathname.split('/')[1] ?? '');
  const title = TITLES[location.pathname] ?? TITLES[base] ?? 'Atheleos Admin';

  // Keep the group containing the active route expanded.
  useEffect(() => {
    const active = NAV_ITEMS.find((n) => n.to === base || (n.to !== '/' && location.pathname.startsWith(n.to)));
    if (active?.group) {
      setClosedGroups((prev) => (prev[active.group!] ? { ...prev, [active.group!]: false } : prev));
    }
  }, [location.pathname, base]);

  const toggleGroup = (g: string) => {
    setClosedGroups((prev) => {
      const next = { ...prev, [g]: !prev[g] };
      try { localStorage.setItem('atheleos-nav-groups', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try { localStorage.setItem('atheleos-nav-collapsed', c ? '0' : '1'); } catch { /* ignore */ }
      return !c;
    });
  };

  const renderItem = (n: NavItem) => {
    const Icon = n.icon;
    return (
      <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        onClick={() => setDrawer(false)} title={collapsed ? n.label : undefined}>
        <span className="nav-icon" aria-hidden><Icon /></span>
        <span className="nav-label">{n.label}</span>
      </NavLink>
    );
  };

  return (
    <div className={`shell${collapsed ? ' nav-collapsed' : ''}`}>
      {drawer && <div className="sidebar-backdrop" onClick={() => setDrawer(false)} />}
      <aside className={`sidebar${drawer ? ' open' : ''}`} aria-label="Admin navigation">
        <div className="brand">
          <img src="/atheleos.png" alt="Atheleos" className="brand-logo-img" />
          <span className="brand-text">
            <span className="brand-name">Atheleos</span>
            <span className="brand-sub">Admin Panel</span>
          </span>
        </div>
        <nav>
          <div className="nav-standalone">{standalone.map(renderItem)}</div>
          {NAV_GROUPS.map((g) => {
            const items = visible.filter((n) => n.group === g);
            if (items.length === 0) return null;
            const closed = !!closedGroups[g];
            return (
              <div key={g} className={`nav-group${closed ? ' closed' : ''}`}>
                <button type="button" className="nav-group-btn" onClick={() => toggleGroup(g)}
                  aria-expanded={!closed} aria-label={`Toggle ${g} section`} title={g}>
                  <span>{g}</span><ChevronDown aria-hidden />
                </button>
                <div className="nav-group-items"><div>{items.map(renderItem)}</div></div>
              </div>
            );
          })}
        </nav>
        {user && (
          <div className="sidebar-profile">
            <Avatar name={user.name} size={34} />
            <span className="profile-meta">
              <span className="profile-name">{user.name}</span>
              <span className="profile-role" style={{ display: 'block' }}>{ROLE_LABELS[user.role]}</span>
            </span>
            <button type="button" className="icon-btn sidebar-collapse-btn" onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </button>
          </div>
        )}
      </aside>
      <div className="main-col">
        <header className="topbar">
          <button className="icon-btn hamburger" onClick={() => setDrawer(true)} aria-label="Open navigation"><Menu /></button>
          <div className="topbar-title">
            <div className="crumbs">Atheleos&nbsp;/&nbsp;Admin</div>
            <div className="page-title">{title}</div>
          </div>
          <div className="spacer" />
          <GlobalSearch />
          <ThemeToggle />
          <NotificationsBell />
          <ProfileMenu />
        </header>
        <main style={{ flex: 1, minWidth: 0 }}>
          {children ?? <Outlet />}
        </main>
        <footer className="small faint" style={{ padding: '12px 26px', borderTop: '1px solid var(--border-soft)' }}>
          Atheleos Admin · <Link to="/health">System health</Link> · All administrative actions are audit-logged.
        </footer>
      </div>
    </div>
  );
}
