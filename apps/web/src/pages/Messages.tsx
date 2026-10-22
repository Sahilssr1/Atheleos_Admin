import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ChatMessageItem, Conversation, Paginated } from '@atheleos/shared';
import { api, ApiError, qs } from '../lib/api';
import { useFetch, useDebounced } from '../hooks/useFetch';
import { fmtDate, timeAgo } from '../lib/format';
import { PermissionGate, useAuth } from '../auth/AuthContext';
import { Avatar, Badge, Button, EmptyState, ErrorState, SearchInput, Skeleton } from '../components/ui';
import { PromptDialog } from '../components/Dialog';
import { useToast } from '../components/Toast';

const PAGE_SIZE = 30;

/**
 * Direct Message center. Access is permission-gated (messages.view) and every
 * conversation view is audit-logged by the API. The API has no realtime push
 * channel for admin clients, so the open thread polls every 15 seconds.
 */
export default function Messages() {
  const toast = useToast();
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const convs = useFetch(
    () => api.get<Paginated<Conversation>>(`/messages/conversations${qs({ q: debouncedQ, page, pageSize: PAGE_SIZE })}`),
    [debouncedQ, page],
  );
  const thread = useFetch(
    () => (selectedId
      ? api.get<{ conversation: Conversation; messages: Paginated<ChatMessageItem> }>(`/messages/conversations/${selectedId}?page=1&pageSize=100`)
      : Promise.resolve(null)),
    [selectedId],
  );
  const threadItems = thread.data?.messages.items ?? [];

  // Poll the open thread every 15s (documented polling approach — no admin push channel exists).
  useEffect(() => {
    if (!selectedId) return;
    const t = window.setInterval(() => thread.reload(), 15000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [thread.data]);

  const selected = convs.data?.items.find((c) => c.id === selectedId) ?? null;
  const myUnread = user && Array.isArray(selected?.unreadBy) ? selected.unreadBy.includes(user.id) : false;
  void myUnread;

  const send = async () => {
    if (!selectedId || !draft.trim()) return;
    setSending(true);
    try {
      await api.post(`/messages/conversations/${selectedId}/send`, { content: draft.trim() });
      setDraft('');
      thread.reload(); convs.reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Message failed to send.', 'error');
    } finally { setSending(false); }
  };

  const addNote = async (text: string) => {
    if (!selectedId) return;
    try {
      await api.post(`/messages/conversations/${selectedId}/note`, { text });
      toast.push('Internal note recorded.', 'success');
      setNoteOpen(false);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not save note.', 'error');
    }
  };

  return (
    <div>
      <div style={{ padding: '14px 24px 0' }}>
        <div className="config-box" style={{ borderStyle: 'solid' }}>
          🔒 <strong>Privacy & audit:</strong> private conversations are visible only to staff holding the
          <span className="mono"> messages.view</span> permission. Opening a conversation writes an audit-log
          entry, and admin messages are clearly marked as sent by the admin team in the app.
        </div>
      </div>
      <div className="dm-layout">
        {/* Conversation list */}
        <div className={`dm-list${selectedId ? ' hidden-mobile' : ''}`}>
          <div style={{ padding: 12 }}>
            <SearchInput placeholder="Search conversations or users…" value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search conversations" />
          </div>
          {convs.loading && !convs.data
            ? <div style={{ padding: 12 }}><Skeleton height={52} /><div style={{ height: 8 }} /><Skeleton height={52} /></div>
            : convs.error && !convs.data
              ? <div style={{ padding: 12 }}><ErrorState error={convs.error} onRetry={convs.reload} /></div>
              : convs.data?.items.length === 0
                ? <EmptyState icon="💬" title="No conversations" hint="No conversations match your search." />
                : convs.data?.items.map((c) => (
                  <button key={c.id} className={`dm-conv${c.id === selectedId ? ' active' : ''}`} onClick={() => setSelectedId(c.id)}>
                    <Avatar name={c.name || c.id} size={42} />
                    <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <span className="row between">
                        <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || 'Conversation'}</strong>
                        <span className="small faint">{timeAgo(c.lastMessageAt)}</span>
                      </span>
                      <span className="small muted" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.lastMessage || '—'}</span>
                      <span className="small faint">{c.type} · {(c.participantIds || []).length} participants</span>
                    </span>
                    {(c.unreadBy || []).length > 0 && <Badge tone="danger">{c.unreadBy.length} unread</Badge>}
                  </button>
                ))}
          {convs.data && convs.data.total !== null && convs.data.total > PAGE_SIZE && (
            <div className="row" style={{ justifyContent: 'center', padding: 10 }}>
              <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</Button>
              <span className="small muted">Page {page}</span>
              <Button size="sm" disabled={page * PAGE_SIZE >= convs.data.total} onClick={() => setPage(page + 1)}>Next →</Button>
            </div>
          )}
        </div>

        {/* Thread */}
        <div className={`dm-thread${selectedId ? '' : ' hidden-mobile'}`}>
          {!selectedId ? (
            <EmptyState icon="💬" title="Select a conversation" hint="Choose a conversation from the list to review it. Views are audit-logged." />
          ) : thread.loading && !thread.data ? (
            <div style={{ padding: 16 }}><Skeleton height={18} /><div style={{ height: 10 }} /><Skeleton height={18} width="60%" /></div>
          ) : thread.error && !thread.data ? (
            <ErrorState error={thread.error} onRetry={thread.reload} />
          ) : (
            <>
              <div className="row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elev)' }}>
                <button className="btn ghost sm hamburger" style={{ display: undefined }} onClick={() => setSelectedId(null)}>←</button>
                <Avatar name={selected?.name || ''} size={34} />
                <div style={{ minWidth: 0 }}>
                  <strong>{selected?.name || 'Conversation'}</strong>
                  <div className="small faint">{(selected?.participantIds || []).join(', ')}</div>
                </div>
                <span className="spacer" />
                <span className="small faint">Auto-refreshes every 15s</span>
                <Button size="sm" variant="ghost" onClick={() => setNoteOpen(true)}>+ Internal note</Button>
              </div>
              <div className="dm-messages" ref={scrollRef}>
                {threadItems.length === 0 && <EmptyState icon="💬" title="No messages" hint="This conversation has no messages yet." />}
                {threadItems.map((m) => {
                  const isAdmin = m.senderId.startsWith('admin:');
                  return (
                    <div key={m.id} style={{ display: 'flex', flexDirection: 'column' }}>
                      <div className={`bubble ${isAdmin ? 'admin' : 'them'}`}>
                        {m.type !== 'text' && <span className="small">[{m.type}] </span>}
                        {m.content}
                      </div>
                      <span className="bubble-meta" style={{ alignSelf: isAdmin ? 'flex-end' : 'flex-start' }}>
                        {isAdmin ? 'Admin team' : m.senderId} · {fmtDate(m.createdAt)} · {m.state}
                      </span>
                    </div>
                  );
                })}
              </div>
              <PermissionGate permission="messages.send" fallback={<p className="small faint" style={{ padding: '10px 16px' }}>You can read this conversation but don’t have the messages.send permission.</p>}>
                <form style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--border)', background: 'var(--bg-elev)' }}
                  onSubmit={(e) => { e.preventDefault(); void send(); }}>
                  <input className="input" placeholder="Message as the Atheleos admin team…" value={draft}
                    onChange={(e) => setDraft(e.target.value)} aria-label="Message text" />
                  <Button variant="primary" type="submit" disabled={sending || !draft.trim()}>{sending ? 'Sending…' : 'Send'}</Button>
                </form>
              </PermissionGate>
            </>
          )}
        </div>

        {/* Participant info */}
        <aside className="dm-info">
          {selected ? (
            <>
              <h3>Conversation info</h3>
              <dl className="kv" style={{ gridTemplateColumns: '90px 1fr' }}>
                <dt>Type</dt><dd>{selected.type}</dd>
                <dt>Last activity</dt><dd>{fmtDate(selected.lastMessageAt)}</dd>
                <dt>Unread by</dt><dd>{(selected.unreadBy || []).length ? selected.unreadBy.join(', ') : '—'}</dd>
              </dl>
              <h3 style={{ marginTop: 16 }}>Participants</h3>
              {(selected.participantIds || []).map((pid) => (
                <div key={pid} className="row" style={{ marginBottom: 8 }}>
                  <Avatar name={pid} size={30} />
                  <Link to={`/users/${pid}`} className="small mono">{pid}</Link>
                </div>
              ))}
              <hr className="divider" />
              <p className="small muted">Need to act on this conversation? Use <Link to="/moderation">Moderation</Link> to open a case, or add an internal note above.</p>
            </>
          ) : (
            <p className="muted small">Participant details appear here when a conversation is selected.</p>
          )}
        </aside>
      </div>

      {noteOpen && (
        <PromptDialog title="Internal note" label="Note linked to this conversation (staff only)"
          onCancel={() => setNoteOpen(false)} onSubmit={addNote} submitLabel="Save note" />
      )}
    </div>
  );
}
