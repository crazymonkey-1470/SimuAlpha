import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import SignalBadge from '../components/SignalBadge';
import ScoreRing from '../components/ScoreRing';
import LoadingSpinner from '../components/LoadingSpinner';
import usePageTitle from '../hooks/usePageTitle';

function winColor(winner, ticker) {
  if (!winner) return 'var(--text-secondary)';
  return winner === ticker ? 'var(--signal-green)' : 'var(--text-dim)';
}

export default function Compare() {
  const navigate = useNavigate();
  usePageTitle('Compare Stocks');
  const [ticker1, setTicker1] = useState('');
  const [ticker2, setTicker2] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleCompare() {
    const t1 = ticker1.trim().toUpperCase();
    const t2 = ticker2.trim().toUpperCase();
    if (!t1 || !t2) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/compare/${t1}/${t2}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Comparison failed');
        setResult(null);
      } else {
        setResult(await res.json());
      }
    } catch {
      setError('Network error');
    }
    setLoading(false);
  }

  const s1 = result?.stock1;
  const s2 = result?.stock2;

  return (
    <div style={{ paddingTop: '40px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{
          fontFamily: 'Cormorant Garamond', fontSize: '48px',
          fontWeight: 300, color: 'var(--text-primary)', marginBottom: '8px'
        }}>
          Compare Stocks
        </h1>
        <p style={{
          fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-secondary)'
        }}>
          Side-by-side comparison of TLI scores, fundamentals, and technicals.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '32px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={ticker1}
          onChange={e => setTicker1(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleCompare()}
          placeholder="Ticker 1 (e.g. AAPL)"
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '6px', padding: '10px 16px', color: 'var(--text-primary)',
            fontFamily: 'Cormorant Garamond', fontSize: '18px', outline: 'none', width: '160px'
          }}
        />
        <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '14px', color: 'var(--text-dim)' }}>vs</span>
        <input
          value={ticker2}
          onChange={e => setTicker2(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleCompare()}
          placeholder="Ticker 2 (e.g. MSFT)"
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '6px', padding: '10px 16px', color: 'var(--text-primary)',
            fontFamily: 'Cormorant Garamond', fontSize: '18px', outline: 'none', width: '160px'
          }}
        />
        <button
          onClick={handleCompare}
          disabled={loading || !ticker1.trim() || !ticker2.trim()}
          style={{
            background: 'var(--signal-green-dim)', border: '1px solid var(--signal-green)40',
            borderRadius: '6px', padding: '10px 24px', color: 'var(--signal-green)',
            fontFamily: 'IBM Plex Mono', fontSize: '12px', cursor: 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          Compare
        </button>
      </div>

      {error && (
        <div style={{
          fontFamily: 'IBM Plex Mono', fontSize: '12px', color: '#ef4444',
          padding: '12px 16px', background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', marginBottom: '24px'
        }}>
          {error}
        </div>
      )}

      {loading && <LoadingSpinner />}

      {result && !loading && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          {/* Header cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '24px', marginBottom: '32px', alignItems: 'center' }}>
            {/* Stock 1 */}
            <div
              onClick={() => s1 && navigate(`/ticker/${s1.ticker}`)}
              style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: '12px', padding: '24px', cursor: s1 ? 'pointer' : 'default',
                borderTop: `3px solid ${result.overall === s1?.ticker ? 'var(--signal-green)' : 'var(--border)'}`,
              }}
            >
              {s1 ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
                    <ScoreRing score={s1.total_score} size={56} />
                    <div>
                      <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '32px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {s1.ticker}
                      </div>
                      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)' }}>
                        {s1.company_name}
                      </div>
                    </div>
                  </div>
                  <SignalBadge signal={s1.signal} size="sm" />
                </>
              ) : (
                <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-dim)' }}>
                  {ticker1.toUpperCase()} not found in screener
                </div>
              )}
            </div>

            {/* VS badge */}
            <div style={{
              fontFamily: 'Cormorant Garamond', fontSize: '28px', fontWeight: 300,
              color: 'var(--text-dim)', textAlign: 'center'
            }}>
              vs
            </div>

            {/* Stock 2 */}
            <div
              onClick={() => s2 && navigate(`/ticker/${s2.ticker}`)}
              style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: '12px', padding: '24px', cursor: s2 ? 'pointer' : 'default',
                borderTop: `3px solid ${result.overall === s2?.ticker ? 'var(--signal-green)' : 'var(--border)'}`,
              }}
            >
              {s2 ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
                    <ScoreRing score={s2.total_score} size={56} />
                    <div>
                      <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '32px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {s2.ticker}
                      </div>
                      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)' }}>
                        {s2.company_name}
                      </div>
                    </div>
                  </div>
                  <SignalBadge signal={s2.signal} size="sm" />
                </>
              ) : (
                <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-dim)' }}>
                  {ticker2.toUpperCase()} not found in screener
                </div>
              )}
            </div>
          </div>

          {/* Metric comparison table */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '12px', overflow: 'hidden', marginBottom: '32px'
          }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 140px 100px 140px 1fr',
              padding: '12px 20px', borderBottom: '1px solid var(--border)',
              fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)',
              textTransform: 'uppercase', letterSpacing: '0.1em'
            }}>
              <span>{s1?.ticker || ticker1.toUpperCase()}</span>
              <span></span>
              <span style={{ textAlign: 'center' }}>Metric</span>
              <span></span>
              <span style={{ textAlign: 'right' }}>{s2?.ticker || ticker2.toUpperCase()}</span>
            </div>

            {result.comparison.map((row, i) => (
              <div
                key={row.key}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 140px 100px 140px 1fr',
                  padding: '12px 20px', alignItems: 'center',
                  borderBottom: i < result.comparison.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <span style={{
                  fontFamily: 'IBM Plex Mono', fontSize: '14px', fontWeight: 500,
                  color: winColor(row.winner, s1?.ticker),
                }}>
                  {row.v1 != null ? (typeof row.v1 === 'number' ? row.v1.toFixed(1) : row.v1) : '\u2014'}
                  {row.winner === s1?.ticker && ' \u2713'}
                </span>
                <div style={{
                  height: '4px', borderRadius: '2px', overflow: 'hidden',
                  background: 'var(--bg-secondary)',
                }}>
                  {row.winner === s1?.ticker && (
                    <div style={{ width: '100%', height: '100%', background: 'var(--signal-green)', borderRadius: '2px' }} />
                  )}
                </div>
                <span style={{
                  fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)',
                  textAlign: 'center', whiteSpace: 'nowrap'
                }}>
                  {row.label}
                </span>
                <div style={{
                  height: '4px', borderRadius: '2px', overflow: 'hidden',
                  background: 'var(--bg-secondary)',
                }}>
                  {row.winner === s2?.ticker && (
                    <div style={{ width: '100%', height: '100%', background: 'var(--signal-green)', borderRadius: '2px' }} />
                  )}
                </div>
                <span style={{
                  fontFamily: 'IBM Plex Mono', fontSize: '14px', fontWeight: 500,
                  color: winColor(row.winner, s2?.ticker), textAlign: 'right'
                }}>
                  {row.winner === s2?.ticker && '\u2713 '}
                  {row.v2 != null ? (typeof row.v2 === 'number' ? row.v2.toFixed(1) : row.v2) : '\u2014'}
                </span>
              </div>
            ))}
          </div>

          {/* Winner summary */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '12px', padding: '24px', textAlign: 'center'
          }}>
            <div style={{
              fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)',
              textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px'
            }}>
              Overall Winner
            </div>
            <div style={{
              fontFamily: 'Cormorant Garamond', fontSize: '36px', fontWeight: 600,
              color: result.overall === 'TIE' ? 'var(--signal-amber)' : 'var(--signal-green)',
              marginBottom: '8px'
            }}>
              {result.overall === 'TIE' ? 'Tied' : result.overall}
            </div>
            <div style={{
              fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-secondary)'
            }}>
              {s1?.ticker}: {result.wins[s1?.ticker] || 0} wins &middot; {s2?.ticker}: {result.wins[s2?.ticker] || 0} wins
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
