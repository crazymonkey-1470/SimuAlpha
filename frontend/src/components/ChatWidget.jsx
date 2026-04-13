import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const messagesEnd = useRef(null);

  useEffect(() => {
    if (open && !sessionId) {
      fetch('/api/chat/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Chat ' + new Date().toLocaleDateString() }),
      })
        .then(r => r.json())
        .then(data => { if (data?.id) setSessionId(data.id); })
        .catch(() => {});
    }
  }, [open, sessionId]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const res = await fetch(`/api/chat/sessions/${sessionId || 'default'}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response || 'Sorry, I could not generate a response.',
        tickers: data.tickers,
        intent: data.intent,
      }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <>
      {/* Toggle button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(!open)}
        style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 999,
          width: '52px', height: '52px', borderRadius: '50%',
          background: open ? 'var(--bg-card)' : 'var(--signal-green)',
          border: open ? '1px solid var(--border)' : 'none',
          color: open ? 'var(--text-primary)' : '#0c0c0e',
          fontSize: '20px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        {open ? '\u2715' : '\u{1F4AC}'}
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'fixed', bottom: '88px', right: '24px', zIndex: 998,
              width: '380px', maxWidth: 'calc(100vw - 48px)', height: '500px', maxHeight: 'calc(100vh - 120px)',
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              boxShadow: '0 8px 48px rgba(0,0,0,0.4)',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: 'var(--signal-green)', flexShrink: 0,
              }} />
              <div>
                <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)' }}>
                  SimuAlpha Assistant
                </div>
                <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-dim)' }}>
                  Ask about any stock, signal, or strategy
                </div>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', paddingTop: '40px' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px', opacity: 0.3 }}>&#x1F916;</div>
                  <p style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.7 }}>
                    Try asking:<br />
                    "What do you think about MSFT?"<br />
                    "Explain AAPL's score"<br />
                    "Which stocks are in LOAD THE BOAT?"
                  </p>
                </div>
              )}

              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                  }}
                >
                  <div style={{
                    background: msg.role === 'user' ? 'var(--signal-green-dim)' : 'var(--bg-secondary)',
                    border: `1px solid ${msg.role === 'user' ? 'var(--signal-green)40' : 'var(--border)'}`,
                    borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    padding: '10px 14px',
                  }}>
                    <div style={{
                      fontFamily: 'IBM Plex Mono', fontSize: '12px',
                      color: 'var(--text-primary)', lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                    }}>
                      {msg.content}
                    </div>
                    {msg.tickers?.length > 0 && (
                      <div style={{ marginTop: '6px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {msg.tickers.map(t => (
                          <span key={t} style={{
                            fontFamily: 'IBM Plex Mono', fontSize: '9px', fontWeight: 600,
                            background: 'var(--signal-green-dim)', color: 'var(--signal-green)',
                            padding: '2px 6px', borderRadius: '3px',
                          }}>{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}

              {loading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ alignSelf: 'flex-start' }}>
                  <div style={{
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                    borderRadius: '12px 12px 12px 2px', padding: '12px 16px',
                  }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {[0, 1, 2].map(i => (
                        <motion.div key={i}
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                          style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-dim)' }}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEnd} />
            </div>

            {/* Input */}
            <div style={{
              padding: '12px 16px', borderTop: '1px solid var(--border)',
              display: 'flex', gap: '8px', alignItems: 'center',
            }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about a stock..."
                disabled={loading}
                style={{
                  flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                  borderRadius: '8px', padding: '10px 14px',
                  color: 'var(--text-primary)', fontFamily: 'IBM Plex Mono', fontSize: '12px',
                  outline: 'none',
                }}
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                style={{
                  background: input.trim() ? 'var(--signal-green)' : 'var(--bg-secondary)',
                  border: 'none', borderRadius: '8px', width: '36px', height: '36px',
                  color: input.trim() ? '#0c0c0e' : 'var(--text-dim)',
                  fontSize: '16px', cursor: input.trim() ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                &#x2191;
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
