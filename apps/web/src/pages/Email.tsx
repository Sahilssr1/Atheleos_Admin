import { useMemo, useState } from 'react';
import { Mail, Paperclip } from 'lucide-react';
import type { Paginated } from '@atheleos/shared';
import { api, ApiError, qs } from '../lib/api';
import { useFetch } from '../hooks/useFetch';
import { fmtDate } from '../lib/format';
import type { EmailDraft, EmailMessage, EmailQueueItem, EmailStatus, EmailSummary } from '../lib/types';
import { PermissionGate } from '../auth/AuthContext';
import { Badge, Button, Card, ConfigRequired, EmptyState, ErrorState, Pagination, StatusBadge, TableSkeleton } from '../components/ui';
import { Dialog } from '../components/Dialog';
import { useToast } from '../components/Toast';

type Tab = 'inbox' | 'queue' | 'drafts';
const PAGE_SIZE = 25;

interface ComposeState {
  to: string; cc: string; bcc: string; subject: string; html: string; draftId?: string;
}
const EMPTY_COMPOSE: ComposeState = { to: '', cc: '', bcc: '', subject: '', html: '' };
const splitList = (s: string) => s.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
const safeAddress = (val: any): string => {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.map(safeAddress).filter(Boolean).join(', ');
  if (typeof val === 'object') {
    if (val.name && val.address) return `${val.name} <${val.address}>`;
    return val.address || val.name || JSON.stringify(val);
  }
  return String(val);
};

export default function Email() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('inbox');
  const status = useFetch(() => api.get<EmailStatus>('/email/status'), []);
  const [compose, setCompose] = useState<ComposeState | null>(null);

  return (
    <div className="page">
      <div className="page-head row between wrap">
        <div>
          <h1>Email Center</h1>
          <p className="muted" style={{ margin: 0 }}>Mailbox inbox (IMAP), outgoing delivery queue and drafts for the Atheleos support mailbox.</p>
        </div>
        <PermissionGate permission="email.send">
          <Button variant="primary" onClick={() => setCompose(EMPTY_COMPOSE)}><Mail size={15} aria-hidden /> Compose</Button>
        </PermissionGate>
      </div>

      {/* Integration status banner */}
      {status.data && (
        <Card style={{ marginBottom: 16 }}>
          <div className="row wrap">
            <span><span className="health-dot" style={{ background: status.data.smtpConfigured ? 'var(--ok)' : 'var(--warn)' }} /> Sending (SMTP): <strong>{status.data.smtpConfigured ? 'Configured' : 'Not configured — mail is queued to the app delivery queue'}</strong></span>
            <span><span className="health-dot" style={{ background: status.data.imapConfigured ? 'var(--ok)' : 'var(--danger)' }} /> Inbox (IMAP): <strong>{status.data.imapConfigured ? 'Configured' : 'Not configured'}</strong></span>
            <span className="muted small">From: {status.data.from ?? '—'} · Queue: {status.data.queueCount} pending</span>
          </div>
          {!status.data.imapConfigured && (
            <p className="small muted" style={{ marginBottom: 0 }}>
              The inbox cannot be read until IMAP credentials are set on the API server (IMAP_* environment variables). Sending still works through the delivery queue.
            </p>
          )}
        </Card>
      )}
      {status.error ? <div style={{ marginBottom: 16 }}><ErrorState error={status.error} onRetry={status.reload} /></div> : null}

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'inbox'} className={tab === 'inbox' ? 'active' : ''} onClick={() => setTab('inbox')}>Inbox</button>
        <button role="tab" aria-selected={tab === 'queue'} className={tab === 'queue' ? 'active' : ''} onClick={() => setTab('queue')}>Sent & queue</button>
        <button role="tab" aria-selected={tab === 'drafts'} className={tab === 'drafts' ? 'active' : ''} onClick={() => setTab('drafts')}>Drafts</button>
      </div>

      {tab === 'inbox' && <InboxTab onCompose={setCompose} />}
      {tab === 'queue' && <QueueTab />}
      {tab === 'drafts' && <DraftsTab onCompose={setCompose} />}

      {compose && (
        <ComposeDialog initial={compose} onClose={() => setCompose(null)}
          onSent={(msg) => { toast.push(msg, 'success'); setCompose(null); }} />
      )}
    </div>
  );
}

function InboxTab({ onCompose }: { onCompose: (c: ComposeState) => void }) {
  const [page, setPage] = useState(1);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const list = useFetch(
    () => api.get<Paginated<EmailSummary>>(`/email/inbox${qs({ page, pageSize: PAGE_SIZE })}`),
    [page],
  );
  const message = useFetch(
    () => (selectedUid ? api.get<EmailMessage>(`/email/inbox/${selectedUid}`) : Promise.resolve(null)),
    [selectedUid],
  );

  if (list.error && !list.data) {
    if (list.error instanceof ApiError && list.error.isConfigError) {
      return <ConfigRequired code={list.error.code} message="IMAP is not configured on the admin API, so the mailbox inbox is unavailable." />;
    }
    return <ErrorState error={list.error} onRetry={list.reload} />;
  }

  return (
    <div className="email-layout">
      <div className="email-list">
        {list.loading && !list.data ? <TableSkeleton rows={8} cols={2} /> : (
          <>
            {list.data?.items.map((m) => {
              const unread = m.unread ?? (m.seen === undefined ? false : !m.seen);
              return (
                <button key={m.uid} className={`email-item${unread ? ' unread' : ''}${m.uid === selectedUid ? ' active' : ''}`}
                  onClick={() => setSelectedUid(m.uid)}>
                  <span className="row between">
                    <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{safeAddress(m.from)}</strong>
                    <span className="small faint">{m.date ? new Date(m.date).toLocaleDateString() : ''}</span>
                  </span>
                  <span className="email-subject" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject || '(no subject)'}</span>
                  {m.snippet && <span className="small muted" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.snippet}</span>}
                  {m.hasAttachments && <span className="small" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Paperclip size={12} aria-hidden /> attachment</span>}
                </button>
              );
            })}
            {list.data && list.data.items.length === 0 && <EmptyState icon="📥" title="Inbox is empty" hint="No messages in this folder." />}
            {list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />}
          </>
        )}
      </div>
      <div className="email-reader">
        {!selectedUid ? (
          <EmptyState icon="✉️" title="Select a message" hint="Choose a message from the inbox to read it here." />
        ) : message.loading && !message.data ? (
          <TableSkeleton rows={6} cols={2} />
        ) : message.error ? (
          <ErrorState error={message.error} onRetry={message.reload} />
        ) : message.data && (
          <article>
            <h2 style={{ fontSize: 18 }}>{message.data.subject || '(no subject)'}</h2>
            <dl className="kv">
              <dt>From</dt><dd>{safeAddress(message.data.from)}</dd>
              <dt>To</dt><dd>{safeAddress(message.data.to) || '—'}</dd>
              {message.data.cc && <><dt>CC</dt><dd>{safeAddress(message.data.cc)}</dd></>}
              <dt>Date</dt><dd>{fmtDate(message.data.date)}</dd>
            </dl>
            {message.data.attachments && message.data.attachments.length > 0 && (
              <p className="small" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><Paperclip size={13} aria-hidden /> {message.data.attachments.map((a) => `${a.filename}${a.size ? ` (${Math.round(a.size / 1024)} KB)` : ''}`).join(', ')}</p>
            )}
            <hr className="divider" />
            {message.data.html
              ? <div style={{ overflowWrap: 'anywhere' }} dangerouslySetInnerHTML={{ __html: message.data.html }} />
              : <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', overflowWrap: 'anywhere' }}>{message.data.text ?? ''}</pre>}
            <hr className="divider" />
            <PermissionGate permission="email.send">
              <div className="row wrap">
                <Button size="sm" variant="primary" onClick={() => onCompose({
                  to: safeAddress(message.data!.from), cc: '', bcc: '',
                  subject: message.data!.subject?.startsWith('Re:') ? message.data!.subject : `Re: ${message.data!.subject ?? ''}`,
                  html: `<br/><br/><blockquote style="border-left:3px solid #ccc;margin:0;padding-left:12px;color:#666">${message.data!.html ?? (message.data!.text ?? '').replace(/\n/g, '<br/>')}</blockquote>`,
                })}>↩ Reply</Button>
                <Button size="sm" onClick={() => onCompose({
                  to: '', cc: '', bcc: '',
                  subject: message.data!.subject?.startsWith('Fwd:') ? message.data!.subject : `Fwd: ${message.data!.subject ?? ''}`,
                  html: `<br/><br/>---------- Forwarded message ----------<br/>From: ${safeAddress(message.data!.from)}<br/>${message.data!.html ?? (message.data!.text ?? '').replace(/\n/g, '<br/>')}`,
                })}>↪ Forward</Button>
              </div>
            </PermissionGate>
          </article>
        )}
      </div>
    </div>
  );
}

function QueueTab() {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useFetch(
    () => api.get<Paginated<EmailQueueItem>>(`/email/queue${qs({ page, pageSize: PAGE_SIZE })}`),
    [page],
  );
  return (
    <div className="card flush">
      {loading && !data ? <TableSkeleton cols={5} /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
        <>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>To</th><th>Subject</th><th>Delivery state</th><th>Attempts</th><th>Error</th><th>Queued</th></tr></thead>
            <tbody>
              {data?.items.map((m) => (
                <tr key={m.id}>
                  <td>{safeAddress(m.to)}</td>
                  <td>{m.subject ?? <span className="faint">(from app mail queue)</span>}</td>
                  <td>{m.delivery?.state ? <StatusBadge status={m.delivery.state} /> : <span className="faint">unknown</span>}</td>
                  <td>{m.delivery?.attempts ?? '—'}</td>
                  <td className="small" style={{ color: 'var(--danger)' }}>{m.delivery?.error ?? ''}</td>
                  <td>{fmtDate(m.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {data && data.items.length === 0 && <EmptyState icon="📤" title="Queue is empty" hint="Outgoing mail processed by the app delivery worker appears here." />}
          {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
        </>
      )}
    </div>
  );
}

function DraftsTab({ onCompose }: { onCompose: (c: ComposeState) => void }) {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(() => api.get<EmailDraft[]>('/email/drafts'), []);
  const drafts = useMemo(() => (Array.isArray(data) ? data : (data as unknown as Paginated<EmailDraft>)?.items ?? []), [data]);
  const remove = async (id: string) => {
    try { await api.del(`/email/drafts/${id}`); toast.push('Draft deleted.', 'success'); reload(); }
    catch (err) { toast.push(err instanceof ApiError ? err.message : 'Delete failed.', 'error'); }
  };
  if (loading && !data) return <TableSkeleton cols={3} />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (drafts.length === 0) return <EmptyState icon="📝" title="No drafts" hint="Save a draft from the compose window and it will appear here." />;
  return (
    <div className="card flush"><div className="table-wrap"><table className="table">
      <thead><tr><th>To</th><th>Subject</th><th>Updated</th><th /></tr></thead>
      <tbody>
        {drafts.map((d) => (
          <tr key={d.id}>
            <td>{d.to.join(', ') || <span className="faint">—</span>}</td>
            <td>{d.subject || '(no subject)'}</td>
            <td>{fmtDate(d.updatedAt ?? d.createdAt)}</td>
            <td><span className="row" style={{ gap: 4 }}>
              <Button size="sm" onClick={() => onCompose({ to: d.to.join(', '), cc: (d.cc ?? []).join(', '), bcc: (d.bcc ?? []).join(', '), subject: d.subject, html: d.html, draftId: d.id })}>Open</Button>
              <Button size="sm" variant="ghost" onClick={() => remove(d.id)}>Delete</Button>
            </span></td>
          </tr>
        ))}
      </tbody>
    </table></div></div>
  );
}

function ComposeDialog({ initial, onClose, onSent }: {
  initial: ComposeState; onClose: () => void; onSent: (msg: string) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof ComposeState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const send = async () => {
    if (splitList(form.to).length === 0) { toast.push('At least one recipient is required.', 'error'); return; }
    if (!form.subject.trim()) { toast.push('Subject is required.', 'error'); return; }
    setBusy(true);
    try {
      const res = await api.post<{ via: string; id: string }>('/email/send', {
        to: splitList(form.to), cc: splitList(form.cc), bcc: splitList(form.bcc),
        subject: form.subject.trim(), html: form.html, draftId: form.draftId,
      });
      onSent(res.via === 'smtp' ? 'Email sent via SMTP.' : 'Email queued for delivery by the app mail worker.');
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Send failed.', 'error');
    } finally { setBusy(false); }
  };

  const saveDraft = async () => {
    setBusy(true);
    try {
      const saved = await api.post<EmailDraft>('/email/drafts', {
        id: form.draftId, to: splitList(form.to), cc: splitList(form.cc), bcc: splitList(form.bcc),
        subject: form.subject, html: form.html,
      });
      setForm((f) => ({ ...f, draftId: saved.id }));
      toast.push('Draft saved.', 'success');
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not save draft.', 'error');
    } finally { setBusy(false); }
  };

  return (
    <Dialog title="Compose email" onClose={onClose} wide>
      <div className="field"><label htmlFor="em-to">To * (comma separated)</label>
        <input id="em-to" className="input" value={form.to} onChange={set('to')} placeholder="user@example.com" /></div>
      <div className="row wrap">
        <div className="field" style={{ flex: 1, minWidth: 200 }}><label htmlFor="em-cc">CC</label>
          <input id="em-cc" className="input" value={form.cc} onChange={set('cc')} /></div>
        <div className="field" style={{ flex: 1, minWidth: 200 }}><label htmlFor="em-bcc">BCC</label>
          <input id="em-bcc" className="input" value={form.bcc} onChange={set('bcc')} /></div>
      </div>
      <div className="field"><label htmlFor="em-subject">Subject *</label>
        <input id="em-subject" className="input" value={form.subject} onChange={set('subject')} /></div>
      <div className="field">
        <label htmlFor="em-body">Message (HTML)</label>
        {preview
          ? <div className="card" style={{ minHeight: 140 }} dangerouslySetInnerHTML={{ __html: form.html || '<p class="muted">Nothing to preview.</p>' }} />
          : <textarea id="em-body" className="textarea" style={{ minHeight: 160, fontFamily: 'ui-monospace, monospace' }} value={form.html} onChange={set('html')} placeholder="<p>Hello…</p>" />}
      </div>
      <p className="small faint">Attachments are delivered by the app mail pipeline; this console sends HTML mail via SMTP when configured, otherwise it queues into the app’s mail collection.</p>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={() => setPreview((p) => !p)}>{preview ? 'Edit HTML' : 'Preview'}</Button>
        <Button variant="ghost" onClick={saveDraft} disabled={busy}>Save draft</Button>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Discard</Button>
        <Button variant="primary" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send email'}</Button>
      </div>
    </Dialog>
  );
}
