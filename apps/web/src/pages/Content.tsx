import { useEffect, useState } from 'react';
import { CalendarDays, Circle, Clock, Eye, FileText, Flag, Heart, MessageCircle, Share2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ContentItem, ContentType, Paginated } from '@atheleos/shared';
import { api, ApiError, qs } from '../lib/api';
import { useFetch, useDebounced } from '../hooks/useFetch';
import { countdown, fmtDate } from '../lib/format';
import { PermissionGate } from '../auth/AuthContext';
import { Avatar, Badge, Button, EmptyState, ErrorState, Pagination, SearchInput, StatusBadge } from '../components/ui';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { useToast } from '../components/Toast';

const PAGE_SIZE = 24;
export type ContentAction = 'hide' | 'restore' | 'remove';

export function MediaThumb({ item, height }: { item: ContentItem; height?: number }) {
  const m = item.media[0];
  const [imgError, setImgError] = useState(false);
  if (!m) {
    return (
      <div className="media-thumb" style={height ? { aspectRatio: 'auto', height } : undefined}>
        <span className="faint" style={{ display: 'inline-flex' }}>{item.type === 'event' ? <CalendarDays size={32} /> : item.type === 'story' ? <Circle size={32} /> : <FileText size={32} />}</span>
      </div>
    );
  }
  const isVideo = m.type.startsWith('video') || item.type === 'clip' || /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(m.url);
  const videoSrc = m.url && !m.url.includes('#') ? `${m.url}#t=0.001` : m.url;
  return (
    <div className="media-thumb" style={height ? { aspectRatio: 'auto', height } : undefined}>
      {isVideo ? (
        <video
          src={videoSrc}
          poster={m.thumbnailUrl}
          preload="metadata"
          muted
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : !imgError ? (
        <img
          src={m.thumbnailUrl ?? m.url}
          alt=""
          loading="lazy"
          onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span className="faint" style={{ display: 'inline-flex' }}><FileText size={32} /></span>
      )}
      {isVideo && <span className="badge" style={{ position: 'absolute', bottom: 8, right: 8 }}>▶ video</span>}
    </div>
  );
}

export function ContentBrowser({ types, heading, subheading }: {
  types: ContentType[]; heading: string; subheading: string;
}) {
  const [params] = useSearchParams();
  const toast = useToast();
  const initialType = (params.get('type') as ContentType | null);
  const [type, setType] = useState<ContentType>(initialType && types.includes(initialType) ? initialType : types[0]);
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<ContentItem | null>(null);
  const [pendingAction, setPendingAction] = useState<{ item: ContentItem; action: ContentAction } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<ContentAction | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useFetch(
    () => api.get<Paginated<ContentItem>>(`/content${qs({ type, q: debouncedQ, status, page, pageSize: PAGE_SIZE })}`),
    [type, debouncedQ, status, page],
  );

  // Deep link from user detail: ?focus=<id> opens the detail modal once loaded.
  const focus = params.get('focus');
  useEffect(() => {
    if (focus && data && !detail) {
      const found = data.items.find((i) => i.id === focus);
      if (found) setDetail(found);
    }
  }, [focus, data, detail]);

  const doAction = async (item: ContentItem, action: ContentAction, reason: string) => {
    setBusy(true);
    try {
      await api.post(`/content/${item.type}/${item.id}/${action}`, { reason });
      toast.push(`${item.type} ${action === 'remove' ? 'removed' : action === 'hide' ? 'hidden' : 'restored'}.`, 'success');
      setPendingAction(null); setDetail(null); reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Action failed.', 'error');
    } finally { setBusy(false); }
  };

  const doBulk = async (reason: string) => {
    if (!bulkAction) return;
    setBusy(true);
    try {
      const res = await api.post<{ updated?: number }>(`/content/bulk`, {
        type, ids: [...selected], action: bulkAction, reason,
      });
      toast.push(`Bulk ${bulkAction} applied${res?.updated !== undefined ? ` to ${res.updated} items` : ''}.`, 'success');
      setBulkAction(null); setSelected(new Set()); reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Bulk action failed.', 'error');
    } finally { setBusy(false); }
  };

  const bulkSupported = type === 'post' || type === 'clip';
  const toggleSelect = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) { n.delete(id); } else { n.add(id); } return n; });

  return (
    <div className="page">
      <div className="page-head">
        <h1>{heading}</h1>
        <p className="muted" style={{ margin: 0 }}>{subheading}</p>
      </div>

      {types.length > 1 && (
        <div className="tabs" role="tablist">
          {types.map((t) => (
            <button key={t} role="tab" aria-selected={type === t} className={type === t ? 'active' : ''}
              onClick={() => { setType(t); setPage(1); setSelected(new Set()); }}>
              {t === 'post' ? 'Posts' : t === 'clip' ? 'Clips / Reels' : t === 'story' ? 'Stories' : 'Events'}
            </button>
          ))}
        </div>
      )}

      <div className="filters">
        <div className="grow"><SearchInput placeholder="Search captions, authors, IDs…" value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search content" /></div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="c-status">Status</label>
          <select id="c-status" className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All</option>
            <option value="visible">Visible</option>
            <option value="hidden">Hidden</option>
            <option value="removed">Removed</option>
          </select>
        </div>
        {bulkSupported && selected.size > 0 && (
          <PermissionGate permission="content.moderate">
            <div className="row">
              <span className="small muted">{selected.size} selected</span>
              <Button size="sm" onClick={() => setBulkAction('hide')}>Hide</Button>
              <Button size="sm" onClick={() => setBulkAction('restore')}>Restore</Button>
              <Button size="sm" variant="danger" onClick={() => setBulkAction('remove')}>Remove</Button>
            </div>
          </PermissionGate>
        )}
      </div>

      {loading && !data ? (
        <div className="media-grid">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 250 }} />)}</div>
      ) : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
        <>
          {data && data.items.length === 0 && <EmptyState icon="🖼️" title="No content found" hint="Nothing matches this type, status and search." />}
          <div className="media-grid">
            {data?.items.map((item) => (
              <article key={item.id} className="media-card">
                <div style={{ position: 'relative' }}>
                  <MediaThumb item={item} />
                  <span style={{ position: 'absolute', top: 8, left: 8 }}><StatusBadge status={item.status} /></span>
                  {item.reportCount > 0 && <span style={{ position: 'absolute', top: 8, right: 8 }}><Badge tone="danger"><Flag size={11} /> {item.reportCount}</Badge></span>}
                </div>
                <div className="media-body">
                  <div className="row" style={{ gap: 8 }}>
                    <Avatar src={item.authorAvatar} name={item.authorName} size={26} />
                    <span style={{ minWidth: 0 }}>
                      <Link to={`/users/${item.authorId}`} style={{ fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.authorName || item.authorId}</Link>
                      <span className="small faint">{fmtDate(item.createdAt)}</span>
                    </span>
                  </div>
                  <p className="small muted" style={{ margin: '8px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {item.caption || 'No caption'}
                  </p>
                  <div className="small faint" style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
                    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Heart size={12} aria-hidden /> {item.likes}</span>
                    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><MessageCircle size={12} aria-hidden /> {item.commentsCount}</span>
                    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Share2 size={12} aria-hidden /> {item.shares}</span>
                    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Eye size={12} aria-hidden /> {item.views}</span>
                  </div>
                  {item.type === 'story' && item.expiresAt && (
                    <div className="small" style={{ marginTop: 4, display: 'flex', gap: 5, alignItems: 'center' }}><Clock size={12} aria-hidden /> {countdown(item.expiresAt)} · expires {fmtDate(item.expiresAt)}</div>
                  )}
                  <div className="row" style={{ marginTop: 10 }}>
                    {bulkSupported && (
                      <PermissionGate permission="content.moderate">
                        <label className="checkbox-row small">
                          <input type="checkbox" aria-label={`Select ${item.type} ${item.id}`}
                            checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)} /> Select
                        </label>
                      </PermissionGate>
                    )}
                    <span className="spacer" />
                    <Button size="sm" variant="ghost" onClick={() => setDetail(item)}>Details</Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
        </>
      )}

      {detail && (
        <Dialog title={`${detail.type} · ${detail.id}`} onClose={() => setDetail(null)} wide>
          <div className="grid cols-2">
            <div>
              {detail.media.length > 0
                ? detail.media.map((m, i) => {
                  const isVid = m.type.startsWith('video') || detail.type === 'clip' || /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(m.url);
                  return (
                    <div key={i} style={{ marginBottom: 8 }}>
                      {isVid
                        ? <video src={m.url} poster={m.thumbnailUrl} controls preload="metadata" style={{ width: '100%', borderRadius: 8, maxHeight: 420, background: '#000' }} />
                        : <img src={m.url} alt="" style={{ width: '100%', borderRadius: 8 }} />}
                    </div>
                  );
                })
                : <MediaThumb item={detail} height={220} />}
            </div>
            <div>
              <div className="row">
                <Avatar src={detail.authorAvatar} name={detail.authorName} size={40} />
                <div>
                  <Link to={`/users/${detail.authorId}`} style={{ fontWeight: 700 }}>{detail.authorName || detail.authorId}</Link>
                  <div className="small faint">{fmtDate(detail.createdAt)}</div>
                </div>
                <span className="spacer" />
                <StatusBadge status={detail.status} />
              </div>
              <p style={{ whiteSpace: 'pre-wrap' }}>{detail.caption || <span className="faint">No caption</span>}</p>
              <dl className="kv">
                <dt>Likes</dt><dd>{detail.likes}</dd>
                <dt>Comments</dt><dd>{detail.commentsCount}</dd>
                <dt>Shares</dt><dd>{detail.shares}</dd>
                <dt>Views</dt><dd>{detail.views}</dd>
                <dt>Reports</dt><dd>{detail.reportCount}</dd>
                {detail.sport && <><dt>Sport</dt><dd>{detail.sport}</dd></>}
                {detail.expiresAt && <><dt>Expires</dt><dd>{fmtDate(detail.expiresAt)} ({countdown(detail.expiresAt)})</dd></>}
              </dl>
              <hr className="divider" />
              <PermissionGate permission="content.moderate" fallback={<p className="small faint">You don’t have the content.moderate permission.</p>}>
                <div className="row wrap">
                  {detail.status !== 'hidden' && <Button size="sm" onClick={() => setPendingAction({ item: detail, action: 'hide' })}>Hide</Button>}
                  {detail.status !== 'visible' && <Button size="sm" onClick={() => setPendingAction({ item: detail, action: 'restore' })}>Restore</Button>}
                  {detail.status !== 'removed' && <Button size="sm" variant="danger" onClick={() => setPendingAction({ item: detail, action: 'remove' })}>Remove</Button>}
                  <Link className="small" to={`/moderation?targetType=${detail.type}&targetId=${detail.id}`}>Open moderation →</Link>
                </div>
              </PermissionGate>
            </div>
          </div>
        </Dialog>
      )}

      {pendingAction && (
        <ConfirmDialog
          title={`${pendingAction.action === 'remove' ? 'Remove' : pendingAction.action === 'hide' ? 'Hide' : 'Restore'} this ${pendingAction.item.type}?`}
          danger={pendingAction.action === 'remove'}
          description={<p className="muted small">This updates the live Atheleos app immediately and is recorded in the audit log.</p>}
          confirmLabel={pendingAction.action}
          busy={busy}
          onCancel={() => setPendingAction(null)}
          onConfirm={(reason) => doAction(pendingAction.item, pendingAction.action, reason)}
        />
      )}
      {bulkAction && (
        <ConfirmDialog
          title={`Bulk ${bulkAction} ${selected.size} ${type}s?`}
          danger={bulkAction === 'remove'}
          description={<p className="muted small">Applies to every selected item. Each change is audit-logged.</p>}
          confirmLabel={`Bulk ${bulkAction}`}
          busy={busy}
          onCancel={() => setBulkAction(null)}
          onConfirm={doBulk}
        />
      )}
    </div>
  );
}

export default function Content() {
  return (
    <ContentBrowser
      types={['post', 'clip', 'story', 'event']}
      heading="Content management"
      subheading="Posts, clips (reels), stories and events from the live Atheleos app. Moderation actions apply immediately."
    />
  );
}
