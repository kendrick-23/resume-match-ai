import { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import Toast from '../components/ui/Toast';

const ToastContext = createContext(null);

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 3000;

let nextId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const removeToast = useCallback((id) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, variant = 'info', { onTap } = {}) => {
    const id = ++nextId;

    setToasts((prev) => {
      const next = [...prev, { id, message, variant, onTap, exiting: false }];
      if (next.length > MAX_VISIBLE) {
        const evicted = next[0];
        clearTimeout(timers.current[evicted.id]);
        delete timers.current[evicted.id];
        return next.slice(1);
      }
      return next;
    });

    timers.current[id] = setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
      );
      setTimeout(() => removeToast(id), 200);
    }, AUTO_DISMISS_MS);

    return id;
  }, [removeToast]);

  const toast = useMemo(() => ({
    success: (msg, opts) => addToast(msg, 'success', opts),
    error: (msg, opts) => addToast(msg, 'error', opts),
    warning: (msg, opts) => addToast(msg, 'warning', opts),
    info: (msg, opts) => addToast(msg, 'info', opts),
  }), [addToast]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <Toast
            key={t.id}
            message={t.message}
            variant={t.variant}
            exiting={t.exiting}
            onTap={t.onTap}
            onDismiss={() => removeToast(t.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
