import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import ActionToast, { getActionMeta } from '../components/ui/ActionToast';

const ActionToastContext = createContext(null);

const VISIBLE_MS = 3000;
const EXIT_MS = 220;

export function ActionToastProvider({ children }) {
  // Single toast at a time — never stacks. New action replaces previous immediately.
  const [current, setCurrent] = useState(null); // { action, exiting, key }
  const dismissTimer = useRef(null);
  const exitTimer = useRef(null);
  const keyRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    if (exitTimer.current) clearTimeout(exitTimer.current);
    dismissTimer.current = null;
    exitTimer.current = null;
  }, []);

  const showAction = useCallback((action) => {
    if (!getActionMeta(action)) return;
    clearTimers();
    keyRef.current += 1;
    setCurrent({ action, exiting: false, key: keyRef.current });

    dismissTimer.current = setTimeout(() => {
      setCurrent((prev) => (prev ? { ...prev, exiting: true } : null));
      exitTimer.current = setTimeout(() => setCurrent(null), EXIT_MS);
    }, VISIBLE_MS);
  }, [clearTimers]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  return (
    <ActionToastContext.Provider value={showAction}>
      {children}
      {current && (
        <ActionToast key={current.key} action={current.action} exiting={current.exiting} />
      )}
    </ActionToastContext.Provider>
  );
}

export function useActionToast() {
  const ctx = useContext(ActionToastContext);
  if (!ctx) throw new Error('useActionToast must be used within ActionToastProvider');
  return ctx;
}
