import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useWatchlist } from '../hooks/useScreener';
import SignalBadge from '../components/SignalBadge';
import ScoreRing from '../components/ScoreRing';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

export default function Watchlist() {
  const navigate = useNavigate();
  const { data, loading, addTicker, removeTicker } = useWatchlist();
  const [input, setInput] = useState('');

  const handleAdd = () => {
    if (input.trim()) {
      addTicker(input.trim().toUpperCase());
      setInput('');
    }
  };

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

      <div style={{ display: 'flex', gap: '12px', marginBottom: '32px' }}>
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
          Add
        </button>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : data.length === 0 ? (
        <EmptyState
          message="Your watchlist is empty"
          sub="Add tickers above to monitor them for TLI entry signals."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {data.map((item, i) => {
            const stock = item.screener_results;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: '10px', padding: '20px 24px',
                  display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap'
                }}
              >
                <div
                  onClick={() => navigate(`/ticker/${item.ticker}`)}
                  style={{ cursor: 'pointer', flex: '0 0 auto' }}
                >
                  <div style={{
                    fontFamily: 'Cormorant Garamond', fontSize: '28px',
                    fontWeight: 600, color: 'var(--text-primary)'
                  }}>
                    {item.ticker}
                  </div>
                  {stock && (
                    <div style={{
                      fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)'
                    }}>
                      {stock.company_name}
                    </div>
                  )}
                </div>

                {stock ? (
                  <>
                    <ScoreRing score={stock.total_score} size={52} />
                    <SignalBadge signal={stock.signal} size="sm" />
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '24px' }}>
                      <div>
                        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)' }}>PRICE</div>
                        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '14px', color: 'var(--text-primary)' }}>
                          {stock.current_price != null ? `$${stock.current_price.toFixed(2)}` : '\u2014'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)' }}>200WMA</div>
                        <div style={{
                          fontFamily: 'IBM Plex Mono', fontSize: '14px',
                          color: stock.pct_from_200wma <= 0 ? 'var(--signal-green)' : 'var(--text-primary)'
                        }}>
                          {stock.pct_from_200wma != null ? `${stock.pct_from_200wma.toFixed(1)}%` : '\u2014'}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-dim)' }}>
                    Not yet scanned
                  </span>
                )}

                <button
                  onClick={() => removeTicker(item.id)}
                  style={{
                    background: 'transparent', border: 'none', color: 'var(--text-dim)',
                    cursor: 'pointer', fontFamily: 'IBM Plex Mono', fontSize: '16px',
                    padding: '4px 8px', marginLeft: 'auto'
                  }}
                >
                  \u00D7
                </button>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
