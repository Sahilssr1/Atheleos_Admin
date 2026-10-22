import { useEffect, useState, type ReactNode } from 'react';
import { Button } from './ui';

export function Dialog({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`dialog${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between" style={{ marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between" style={{ marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close panel">✕</button>
        </div>
        {children}
      </aside>
    </>
  );
}

/**
 * Confirmation dialog for sensitive actions. A reason is always required;
 * `confirmText` supports type-to-confirm flows (e.g. permanent purge: "DELETE").
 */
export function ConfirmDialog({ title, description, confirmLabel = 'Confirm', danger, requireReason = true,
  confirmText, busy, onCancel, onConfirm }: {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  requireReason?: boolean;
  confirmText?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const reasonOk = !requireReason || reason.trim().length > 0;
  const textOk = !confirmText || typed === confirmText;
  return (
    <Dialog title={title} onClose={onCancel}>
      {description && <div style={{ marginBottom: 12 }}>{description}</div>}
      {requireReason && (
        <div className="field">
          <label htmlFor="confirm-reason">Reason (recorded in the audit log) *</label>
          <textarea id="confirm-reason" className="textarea" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this action being taken?" autoFocus />
        </div>
      )}
      {!requireReason && (
        <div className="field">
          <label htmlFor="confirm-note">Note (optional)</label>
          <textarea id="confirm-note" className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </div>
      )}
      {confirmText && (
        <div className="field">
          <label htmlFor="confirm-type">Type <span className="mono">{confirmText}</span> to confirm *</label>
          <input id="confirm-type" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} disabled={!reasonOk || !textOk || busy}
          onClick={() => onConfirm(reason.trim())}>
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

/** Simple prompt-style dialog collecting a single text value. */
export function PromptDialog({ title, label, placeholder, submitLabel = 'Save', busy, initial = '', onCancel, onSubmit }: {
  title: string; label: string; placeholder?: string; submitLabel?: string; busy?: boolean; initial?: string;
  onCancel: () => void; onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Dialog title={title} onClose={onCancel}>
      <div className="field">
        <label htmlFor="prompt-value">{label}</label>
        <textarea id="prompt-value" className="textarea" value={value} onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder} autoFocus />
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="primary" disabled={!value.trim() || busy} onClick={() => onSubmit(value.trim())}>
          {busy ? 'Working…' : submitLabel}
        </Button>
      </div>
    </Dialog>
  );
}
