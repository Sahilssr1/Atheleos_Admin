import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface Toast { id: number; kind: 'success' | 'error' | 'info'; message: string }
const ToastCtx = createContext<{ push: (message: string, kind?: Toast['kind']) => void }>({ push: () => {} });

export function useToast() { return useContext(ToastCtx); }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const push = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, kind, message }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span aria-hidden>{t.kind === 'success' ? '✓' : t.kind === 'error' ? '⚠' : 'ℹ'}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
