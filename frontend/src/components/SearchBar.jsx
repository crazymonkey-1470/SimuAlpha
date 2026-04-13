import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const ref = useRef(null);
  const timerRef = useRef(null);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const data = await resp.json();
        setResults(data.results || []);
        setOpen(true);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 300);

    return () => clearTimeout(timerRef.current);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleSelect(ticker) {
    setQuery('');
    setOpen(false);
    navigate(`/ticker/${ticker}`);
  }

  const SIGNAL_COLORS = {
    'LOAD THE BOAT': '#10b981',
    'ACCUMULATE': '#3b82f6',
    'WATCH': '#f59e0b',
    'HOLD': '#8b5cf6',
    'CAUTION': '#f97316',
    'TRIM': '#ef4444',
    'AVOID': '#6b7280',
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        type="text"
        placeholder="Search stocks..."
        data-search-input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          padding: '6px 12px',
          fontFamily: 'IBM Plex Mono',
          fontSize: '12px',
          color: 'var(--text-primary)',
          width: '200px',
          outline: 'none',
          transition: 'border-color 0.15s',
        }}
      />

      {open && results.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '4px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          maxHeight: '360px',
          overflowY: 'auto',
          zIndex: 200,
          minWidth: '320px',
        }}>
          {results.map((r, i) => (
            <div
              key={r.ticker}
              onClick={() => handleSelect(r.ticker)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                cursor: 'pointer',
                borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none',
                transition: 'background 0.1s',
              }}
              onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-card-hover, rgba(255,255,255,0.04))'}
              onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <div>
                <span style={{
                  fontFamily: 'Cormorant Garamond',
                  fontSize: '16px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginRight: '10px',
                }}>
                  {r.ticker}
                </span>
                <span style={{
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '10px',
                  color: 'var(--text-dim)',
                }}>
                  {(r.company_name || '').substring(0, 30)}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {r.signal && (
                  <span style={{
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '9px',
                    color: SIGNAL_COLORS[r.signal] || 'var(--text-dim)',
                    fontWeight: 600,
                  }}>
                    {r.signal}
                  </span>
                )}
                {r.total_score != null && (
                  <span style={{
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: r.total_score >= 70 ? '#10b981' : r.total_score >= 50 ? '#f59e0b' : 'var(--text-secondary)',
                    fontWeight: 500,
                  }}>
                    {r.total_score}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {open && results.length === 0 && query.length >= 2 && !loading && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '4px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '16px',
          zIndex: 200,
          minWidth: '320px',
        }}>
          <div style={{
            fontFamily: 'IBM Plex Mono',
            fontSize: '11px',
            color: 'var(--text-dim)',
            textAlign: 'center',
          }}>
            No stocks found for "{query}"
          </div>
        </div>
      )}
    </div>
  );
}
