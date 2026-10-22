import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { CommentItem, Paginated } from '@atheleos/shared';
import { api, ApiError, qs } from '../lib/api';
import { useFetch, useDebounced } from '../hooks/useFetch';
import { fmtDate } from '../lib/format';
import { PermissionGate } from '../auth/AuthContext';
import { Avatar, Button, EmptyState, ErrorState, Pagination, SearchInput, StatusBadge, TableSkeleton } from '../components/ui';
import { ConfirmDialog } from '../components/Dialog';
import { useToast } from '../components/Toast';

const PAGE_SIZE = 25;
type Action = 'hide' | 'restore' | 'remove';

export default function Comments() {
  const [params] = useSearchParams();
  const toast = useToast();
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q);
  const [postId, setPostId] = useState(params.get('postId') ?? '');
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<{ comment: CommentItem; action: Action } | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useFetch(
    () => api.get<Paginated<CommentItem>>(`/comments${qs({ q: debouncedQ, postId, page, pageSize: PAGE_SIZE })}`),
    [debouncedQ, postId, page],
  );

  const doAction = async (reason: string) => {
    if (!pending) return;
    setBusy(true);
    try {
      await api.post(`/comments/${pending.comment.postId}/${pending.comment.id}/${pending.action}`, { reason });
      toast.push(`Comment ${pending.action === 'hide' ? 'hidden' : pending.action === 'remove' ? 'removed' : 'restored'}.`, 'success');
      setPending(null); reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Action failed.', 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Comments</h1>
        <p className="muted" style={{ margin: 0 }}>All comments and replies across posts and clips. Hide, restore or remove with a recorded reason.</p>
      </div>
      <div className="filters">
        <div className="grow"><SearchInput placeholder="Search comment text or author…" value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search comments" /></div>
        <div className="field" style={{ margin: 0, minWidth: 220 }}>
          <label htmlFor="cm-post">Filter by post / clip ID</label>
          <input id="cm-post" className="input mono" value={postId} onChange={(e) => { setPostId(e.target.value); setPage(1); }} placeholder="postId" />
        </div>
      </div>

      <div className="card flush">
        {loading && !data ? <TableSkeleton cols={5} /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Comment</th><th>Author</th><th>On</th><th>Status</th><th>♥ / replies</th><th>Actions</th></tr></thead>
              <tbody>
                {data?.items.map((c) => (
                  <tr key={`${c.postId}-${c.id}`}>
                    <td style={{ maxWidth: 420 }}>
                      <span style={{ display: 'block', overflowWrap: 'anywhere' }}>{c.text}</span>
                      <span className="small faint">{fmtDate(c.createdAt)}{c.parentId ? ' · reply' : ''}</span>
                    </td>
                    <td>
                      <span className="row" style={{ gap: 7 }}>
                        <Avatar src={c.authorAvatar} name={c.authorName} size={26} />
                        <Link to={`/users/${c.authorId}`}>{c.authorName || c.authorId}</Link>
                      </span>
                    </td>
                    <td><Link to={`/content?focus=${c.postId}`}>{c.postId}</Link></td>
                    <td><StatusBadge status={c.status} /></td>
                    <td>{c.likesCount} / {c.replyCount}</td>
                    <td>
                      <PermissionGate permission="comments.moderate">
                        <span className="row" style={{ gap: 4 }}>
                          {c.status !== 'hidden' && <Button size="sm" variant="ghost" onClick={() => setPending({ comment: c, action: 'hide' })}>Hide</Button>}
                          {c.status !== 'visible' && <Button size="sm" variant="ghost" onClick={() => setPending({ comment: c, action: 'restore' })}>Restore</Button>}
                          {c.status !== 'removed' && <Button size="sm" variant="ghost" onClick={() => setPending({ comment: c, action: 'remove' })}>Remove</Button>}
                        </span>
                      </PermissionGate>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {data && data.items.length === 0 && <EmptyState icon="💭" title="No comments" hint="No comments match the current filters." />}
            {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
          </>
        )}
      </div>

      {pending && (
        <ConfirmDialog
          title={`${pending.action === 'remove' ? 'Remove' : pending.action === 'hide' ? 'Hide' : 'Restore'} this comment?`}
          danger={pending.action === 'remove'}
          description={<p className="muted small">“{pending.comment.text.slice(0, 140)}” — the change applies to the live app and is audit-logged.</p>}
          confirmLabel={pending.action} busy={busy}
          onCancel={() => setPending(null)} onConfirm={doAction}
        />
      )}
    </div>
  );
}
