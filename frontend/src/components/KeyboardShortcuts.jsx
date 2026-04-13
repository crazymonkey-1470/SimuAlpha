import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const SHORTCUTS = [
  { keys: ['/', ''], label: 'Focus search', action: 'search' },
  { keys: ['g', 'd'], label: 'Go to Dashboard', action: 'nav', path: '/dashboard' },
  { keys: ['g', 's'], label: 'Go to Screener', action: 'nav', path: '/screener' },
  { keys: ['g', 'w'], label: 'Go to Watchlist', action: 'nav', path: '/my?tab=watchlist' },
  { keys: ['g', 'p'], label: 'Go to Portfolio', action: 'nav', path: '/my?tab=portfolio' },
  { keys: ['g', 'i'], label: 'Go to Intelligence', action: 'nav', path: '/signals?tab=intelligence' },
  { keys: ['g', 'c'], label: 'Go to Consensus', action: 'nav', path: '/signals?tab=consensus' },
  { keys: ['g', 'm'], label: 'Go to Market', action: 'nav', path: '/market' },
  { keys: ['g', 'a'], label: 'Go to Agent', action: 'nav', path: '/agent' },
  { keys: ['?'], label: 'Show shortcuts', action: 'help' },
  { keys: ['Esc'], label: 'Close modal / dialog', action: 'escape' },
];

export default function KeyboardShortcuts() {
  const navigate = useNavigate();
  const [showHelp, setShowHelp] = useState(false);
  const [pendingG, setPendingG] = useState(false);

  const handleKeyDown = useCallback((e) => {
    // Don't trigger in inputs, textareas, or contenteditable
    const tag = e.target.tagName;
    const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;

    if (e.key === 'Escape') {
      setShowHelp(false);
      return;
    }

    if (isEditable) return;

    // "/" — focus search
    if (e.key === '/' && !pendingG) {
      e.preventDefault();
      const searchInput = document.querySelector('[data-search-input]');
      if (searchInput) searchInput.focus();
      return;
    }

    // "?" — toggle help
    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      e.preventDefault();
      setShowHelp(prev => !prev);
      return;
    }

    // "g" prefix for navigation
    if (e.key === 'g' && !pendingG) {
      setPendingG(true);
      setTimeout(() => setPendingG(false), 1000);
      return;
    }

    if (pendingG) {
      setPendingG(false);
      const shortcut = SHORTCUTS.find(s => s.keys[0] === 'g' && s.keys[1] === e.key);
      if (shortcut?.path) {
        e.preventDefault();
        navigate(shortcut.path);
      }
    }
  }, [navigate, pendingG]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <AnimatePresence>
      {showHelp && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setShowHelp(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px',
              padding: '32px', width: '460px', maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '24px', color: 'var(--text-primary)' }}>
                Keyboard Shortcuts
              </div>
              <button onClick={() => setShowHelp(false)} style={{
                background: 'transparent', border: 'none', color: 'var(--text-dim)',
                fontSize: '18px', cursor: 'pointer',
              }}>&times;</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {SHORTCUTS.map(s => (
                <div key={s.label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 12px', borderRadius: '6px',
                }}>
                  <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {s.label}
                  </span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {s.keys.filter(Boolean).map(k => (
                      <kbd key={k} style={{
                        fontFamily: 'IBM Plex Mono', fontSize: '11px',
                        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                        borderRadius: '4px', padding: '2px 8px',
                        color: 'var(--text-primary)', minWidth: '24px', textAlign: 'center',
                      }}>{k}</kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '16px', fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)', textAlign: 'center' }}>
              Press <kbd style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '3px', padding: '1px 5px', fontSize: '10px' }}>?</kbd> to toggle this dialog
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Pending G indicator */}
      {pendingG && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 2000,
            background: 'var(--bg-card)', border: '1px solid var(--signal-green)40',
            borderRadius: '8px', padding: '8px 16px',
            fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--signal-green)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}
        >
          g + ...  (d=Dashboard, s=Screener, w=Watchlist, p=Portfolio)
        </motion.div>
      )}
    </AnimatePresence>
  );
}
