import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ToastContext = createContext(null);

let toastId = 0;

const TYPE_STYLES = {
  success: { bg: 'rgba(16, 185, 129, 0.12)', border: '#10b981', color: '#34d399' },
  error: { bg: 'rgba(239, 68, 68, 0.12)', border: '#ef4444', color: '#f87171' },
  info: { bg: 'rgba(59, 130, 246, 0.12)', border: '#3b82f6', color: '#60a5fa' },
  warning: { bg: 'rgba(245, 158, 11, 0.12)', border: '#f59e0b', color: '#fbbf24' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const value = useMemo(() => ({
    toast: addToast,
    success: (msg, dur) => addToast(msg, 'success', dur),
    error: (msg, dur) => addToast(msg, 'error', dur),
    info: (msg, dur) => addToast(msg, 'info', dur),
    warning: (msg, dur) => addToast(msg, 'warning', dur),
  }), [addToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div style={{
        position: 'fixed', bottom: '24px', right: '24px',
        zIndex: 9999, display: 'flex', flexDirection: 'column-reverse',
        gap: '8px', pointerEvents: 'none',
      }}>
        <AnimatePresence>
          {toasts.map(t => {
            const style = TYPE_STYLES[t.type] || TYPE_STYLES.info;
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                style={{
                  background: style.bg, border: `1px solid ${style.border}`,
                  borderRadius: '8px', padding: '12px 20px',
                  fontFamily: 'IBM Plex Mono', fontSize: '12px', color: style.color,
                  backdropFilter: 'blur(12px)', pointerEvents: 'auto',
                  cursor: 'pointer', maxWidth: '360px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                }}
                onClick={() => removeToast(t.id)}
              >
                {t.message}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
