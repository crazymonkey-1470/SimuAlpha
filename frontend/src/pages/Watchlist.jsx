import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useWatchlist } from '../hooks/useScreener';
import SignalBadge from '../components/SignalBadge';
import ScoreRing from '../components/ScoreRing';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import usePageTitle from '../hooks/usePageTitle';
import { useToast } from '../components/Toast';

const SORT_OPTIONS = [
  { key: 'added_at', label: 'Date Added' },
  { key: 'total_score', label: 'Score' },
  { key: 'ticker', label: 'Ticker' },
  { key: 'pct_from_200wma', label: '200WMA %' },
];

function signalColor(signal) {
  switch (signal) {
    case 'LOAD THE BOAT': return '#10b981';
    case 'ACCUMULATE': return '#3b82f6';
    case 'WATCH': return '#f59e0b';
    case 'HOLD': return '#8b5cf6';
    case 'CAUTION': return '#f97316';
    case 'TRIM': return '#ef4444';
    case 'AVOID': return '#6b7280';
    default: return 'var(--border)';
  }
}

export default function Watchlist() {
  const navigate = useNavigate();
  const { data, loading, addTicker, removeTicker, updateNotes } = useWatchlist();
  const { success, error: toastError } = useToast();
  usePageTitle('Watchlist');
  const [input, setInput] = useState('');
  const [sortKey, setSortKey] = useState('added_at');
  const [sortDir, setSortDir] = useState('desc');
  const [editingNotes, setEditingNotes] = useState(null);
  const [notesValue, setNotesValue] = useState('');

  const handleAdd = async () => {
    if (input.trim()) {
      const ticker = input.trim().toUpperCase();
      const ok = await addTicker(ticker);
      if (ok) success(`${ticker} added to watchlist`);
      else toastError(`Failed to add ${ticker}`);
      setInput('');
    }
  };

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'ticker' ? 'asc' : 'desc'); }
  };

  const startEditNotes = (item) => {
    setEditingNotes(item.id);
    setNotesValue(item.notes || '');
  };

  const saveNotes = (id) => {
    updateNotes(id, notesValue);
    setEditingNotes(null);
  };

  const sorted = [...data].sort((a, b) => {
    let av, bv;
    if (sortKey === 'ticker') {
      av = a.ticker || '';
      bv = b.ticker || '';
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    if (sortKey === 'added_at') {
      av = a.added_at || '';
      bv = b.added_at || '';
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    av = a.screener_results?.[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity);
    bv = b.screener_results?.[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity);
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  return (
    <div style={{ paddingTop: '40px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{
          fontFamily: 'Cormorant Garamond', fontSize: '48px',
          fontWeight: 300, color: 'var(--text-primary)', marginBottom: '8px'
        }}>
          Watchlist
        </h1>
        <p style={{
          fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-secondary)'
        }}>
          Your personal list. System monitors these and alerts on signal changes.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Enter ticker (e.g. NVO)"
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '6px', padding: '10px 16px', color: 'var(--text-primary)',
            fontFamily: 'Cormorant Garamond', fontSize: '18px', outline: 'none', width: '200px'
          }}
        />
        <button
          onClick={handleAdd}
          style={{
            background: 'var(--signal-green-dim)', border: '1px solid var(--signal-green)40',
            borderRadius: '6px', padding: '10px 20px', color: 'var(--signal-green)',
            fontFamily: 'IBM Plex Mono', fontSize: '12px', cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          + Add
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)' }}>
            Sort:
          </span>
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => handleSort(opt.key)}
              style={{
                background: sortKey === opt.key ? 'var(--bg-card-hover)' : 'transparent',
                border: `1px solid ${sortKey === opt.key ? 'var(--border-light)' : 'var(--border)'}`,
                borderRadius: '4px', padding: '4px 10px',
                color: sortKey === opt.key ? 'var(--text-primary)' : 'var(--text-dim)',
                fontFamily: 'IBM Plex Mono', fontSize: '10px', cursor: 'pointer',
              }}
            >
              {opt.label}
              {sortKey === opt.key && (
                <span style={{ marginLeft: '3px' }}>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
              )}
            </button>
          ))}
          <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
            {data.length} stock{data.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : data.length === 0 ? (
        <EmptyState
          message="Your watchlist is empty"
          sub="Add tickers above to monitor them for TLI entry signals."
        />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Ticker', 'Score', 'Signal', 'Price', '200WMA %', '200MMA %', 'Sector', 'Notes', ''].map(h => (
                  <th key={h} style={{
                    padding: '10px 12px', textAlign: 'left',
                    fontFamily: 'IBM Plex Mono', fontSize: '10px',
                    color: 'var(--text-secondary)', textTransform: 'uppercase',
                    letterSpacing: '0.1em', whiteSpace: 'nowrap'
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((item, i) => {
                const stock = item.screener_results;
                const borderColor = stock ? signalColor(stock.signal) : 'var(--border)';
                return (
                  <motion.tr
                    key={item.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      borderLeft: `3px solid ${borderColor}`,
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <td
                      onClick={() => navigate(`/ticker/${item.ticker}`)}
                      style={{ padding: '14px 12px' }}
                    >
                      <div style={{
                        fontFamily: 'Cormorant Garamond', fontSize: '20px',
                        fontWeight: 600, color: 'var(--text-primary)'
                      }}>
                        {item.ticker}
                      </div>
                      {stock && (
                        <div style={{
                          fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)'
                        }}>
                          {stock.company_name?.substring(0, 24)}
                        </div>
                      )}
                    </td>

                    <td onClick={() => navigate(`/ticker/${item.ticker}`)} style={{ padding: '14px 12px' }}>
                      {stock ? <ScoreRing score={stock.total_score} size={40} /> : <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)' }}>&mdash;</span>}
                    </td>

                    <td onClick={() => navigate(`/ticker/${item.ticker}`)} style={{ padding: '14px 12px' }}>
                      {stock ? <SignalBadge signal={stock.signal} size="sm" /> : <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)' }}>Unscored</span>}
                    </td>

                    <td onClick={() => navigate(`/ticker/${item.ticker}`)} style={{
                      padding: '14px 12px', fontFamily: 'IBM Plex Mono', fontSize: '13px',
                      color: 'var(--text-primary)'
                    }}>
                      {stock?.current_price != null ? `$${stock.current_price.toFixed(2)}` : '\u2014'}
                    </td>

                    <td onClick={() => navigate(`/ticker/${item.ticker}`)} style={{
                      padding: '14px 12px', fontFamily: 'IBM Plex Mono', fontSize: '13px',
                      color: stock?.pct_from_200wma <= 0 ? 'var(--signal-green)' : 'var(--text-primary)'
                    }}>
                      {stock?.pct_from_200wma != null ? `${stock.pct_from_200wma.toFixed(1)}%` : '\u2014'}
                    </td>

                    <td onClick={() => navigate(`/ticker/${item.ticker}`)} style={{
                      padding: '14px 12px', fontFamily: 'IBM Plex Mono', fontSize: '13px',
                      color: stock?.pct_from_200mma <= 0 ? 'var(--signal-green)' : 'var(--text-primary)'
                    }}>
                      {stock?.pct_from_200mma != null ? `${stock.pct_from_200mma.toFixed(1)}%` : '\u2014'}
                    </td>

                    <td onClick={() => navigate(`/ticker/${item.ticker}`)} style={{
                      padding: '14px 12px', fontFamily: 'IBM Plex Mono', fontSize: '11px',
                      color: 'var(--text-secondary)'
                    }}>
                      {stock?.sector || '\u2014'}
                    </td>

                    <td style={{ padding: '14px 12px', minWidth: '180px' }}>
                      {editingNotes === item.id ? (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <input
                            value={notesValue}
                            onChange={e => setNotesValue(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && saveNotes(item.id)}
                            autoFocus
                            style={{
                              background: 'var(--bg-secondary)', border: '1px solid var(--border-light)',
                              borderRadius: '4px', padding: '4px 8px', color: 'var(--text-primary)',
                              fontFamily: 'IBM Plex Mono', fontSize: '11px', outline: 'none',
                              width: '140px'
                            }}
                          />
                          <button
                            onClick={() => saveNotes(item.id)}
                            style={{
                              background: 'var(--signal-green-dim)', border: '1px solid var(--signal-green)40',
                              borderRadius: '3px', padding: '3px 8px', color: 'var(--signal-green)',
                              fontFamily: 'IBM Plex Mono', fontSize: '9px', cursor: 'pointer'
                            }}
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingNotes(null)}
                            style={{
                              background: 'transparent', border: '1px solid var(--border)',
                              borderRadius: '3px', padding: '3px 8px', color: 'var(--text-dim)',
                              fontFamily: 'IBM Plex Mono', fontSize: '9px', cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={(e) => { e.stopPropagation(); startEditNotes(item); }}
                          style={{
                            fontFamily: 'IBM Plex Mono', fontSize: '11px',
                            color: item.notes ? 'var(--text-secondary)' : 'var(--text-dim)',
                            cursor: 'text', padding: '4px 0',
                            borderBottom: '1px dashed var(--border)',
                            minHeight: '20px',
                          }}
                          title="Click to edit notes"
                        >
                          {item.notes || 'Add notes...'}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '14px 12px' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeTicker(item.id); }}
                        style={{
                          background: 'transparent', border: '1px solid transparent',
                          color: 'var(--text-dim)', cursor: 'pointer',
                          fontFamily: 'IBM Plex Mono', fontSize: '14px',
                          padding: '4px 8px', borderRadius: '4px',
                          transition: 'all 0.15s ease'
                        }}
                        title="Remove from watchlist"
                      >
                        &times;
                      </button>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
