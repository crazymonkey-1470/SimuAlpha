import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import LoadingSpinner from '../components/LoadingSpinner';
import usePageTitle from '../hooks/usePageTitle';

const SIGNAL_COLORS = {
  'LOAD THE BOAT': '#10b981',
  'ACCUMULATE': '#3b82f6',
  'WATCH': '#f59e0b',
  'HOLD': '#8b5cf6',
  'CAUTION': '#f97316',
  'TRIM': '#ef4444',
  'AVOID': '#6b7280',
};

export default function Backtesting() {
  usePageTitle('Backtesting');
  const [accuracy, setAccuracy] = useState(null);
  const [waveAccuracy, setWaveAccuracy] = useState(null);
  const [topSignals, setTopSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('signals');

  useEffect(() => {
    Promise.all([
      fetch('/api/backtesting/accuracy').then(r => r.json()).catch(() => null),
      fetch('/api/backtesting/wave-accuracy').then(r => r.json()).catch(() => null),
      fetch('/api/backtesting/top-signals').then(r => r.json()).catch(() => []),
    ]).then(([acc, wave, top]) => {
      setAccuracy(acc);
      setWaveAccuracy(wave);
      setTopSignals(top || []);
      setLoading(false);
    });
  }, []);

  const hasData = accuracy?.total_signals > 0;

  return (
    <div style={{ paddingTop: '40px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontFamily: 'Cormorant Garamond', fontSize: '48px', fontWeight: 300, color: 'var(--text-primary)', marginBottom: '8px' }}>
          Backtesting
        </h1>
        <p style={{ fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-secondary)' }}>
          Signal accuracy and performance tracking across all scored stocks.
        </p>
      </div>

      {loading ? <LoadingSpinner /> : !hasData ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px',
            padding: '64px 32px', textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}>&#x1F4CA;</div>
          <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '28px', color: 'var(--text-primary)', marginBottom: '8px' }}>
            Insufficient Data
          </div>
          <p style={{ fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto', lineHeight: 1.7 }}>
            Backtesting requires signal outcome data to measure accuracy. As the system tracks more signals
            over time, accuracy metrics will appear here automatically.
          </p>
        </motion.div>
      ) : (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '24px' }}>
            {[{ key: 'signals', label: 'Signal Accuracy' }, { key: 'waves', label: 'Wave Accuracy' }, { key: 'top', label: 'Top Signals' }].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                background: tab === t.key ? 'var(--bg-card)' : 'transparent',
                border: tab === t.key ? '1px solid var(--border-light)' : '1px solid transparent',
                borderRadius: '6px', padding: '8px 16px',
                fontFamily: 'IBM Plex Mono', fontSize: '11px', cursor: 'pointer',
                color: tab === t.key ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}>{t.label}</button>
            ))}
          </div>

          {tab === 'signals' && accuracy && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* Summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '32px' }}>
                {[
                  { label: 'TOTAL SIGNALS', value: accuracy.total_signals },
                  { label: 'MEASURED', value: accuracy.measured },
                  { label: 'WINNERS', value: accuracy.winners, color: 'var(--signal-green)' },
                  { label: 'WIN RATE', value: accuracy.win_rate != null ? `${Number(accuracy.win_rate).toFixed(1)}%` : '\u2014', color: accuracy.win_rate > 50 ? 'var(--signal-green)' : '#ef4444' },
                  { label: 'AVG RETURN', value: accuracy.avg_return != null ? `${accuracy.avg_return > 0 ? '+' : ''}${Number(accuracy.avg_return).toFixed(1)}%` : '\u2014', color: accuracy.avg_return > 0 ? 'var(--signal-green)' : '#ef4444' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', letterSpacing: '0.1em', marginBottom: '4px' }}>{s.label}</div>
                    <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '22px', fontWeight: 600, color: s.color || 'var(--text-primary)' }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Per-signal breakdown */}
              {accuracy.by_signal && accuracy.by_signal.length > 0 && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>Accuracy by Signal Type</div>
                  </div>
                  {accuracy.by_signal.map((sig, i) => (
                    <div key={sig.signal} style={{
                      display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 20px',
                      borderBottom: i < accuracy.by_signal.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <div style={{
                        width: '10px', height: '10px', borderRadius: '50%',
                        background: SIGNAL_COLORS[sig.signal] || '#6b7280', flexShrink: 0,
                      }} />
                      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '12px', color: SIGNAL_COLORS[sig.signal] || 'var(--text-primary)', width: '140px', fontWeight: 600 }}>
                        {sig.signal}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${sig.win_rate || 0}%`, background: SIGNAL_COLORS[sig.signal] || '#6b7280', borderRadius: '3px', transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-primary)', width: '50px', textAlign: 'right' }}>
                        {sig.win_rate != null ? `${Number(sig.win_rate).toFixed(0)}%` : '\u2014'}
                      </div>
                      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)', width: '40px', textAlign: 'right' }}>
                        n={sig.count || 0}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {tab === 'waves' && waveAccuracy && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {waveAccuracy.length === 0 ? (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '40px', textAlign: 'center' }}>
                  <p style={{ fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-secondary)' }}>No wave accuracy data available yet.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  {waveAccuracy.map(w => (
                    <div key={w.wave_label} style={{
                      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px',
                    }}>
                      <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '20px', color: 'var(--text-primary)', marginBottom: '12px' }}>
                        {w.wave_label}
                      </div>
                      <div style={{ display: 'flex', gap: '16px' }}>
                        <div>
                          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>WIN RATE</div>
                          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '18px', fontWeight: 600, color: w.win_rate > 50 ? 'var(--signal-green)' : '#ef4444' }}>
                            {Number(w.win_rate).toFixed(0)}%
                          </div>
                        </div>
                        <div>
                          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>AVG RETURN</div>
                          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '18px', fontWeight: 600, color: w.avg_return > 0 ? 'var(--signal-green)' : '#ef4444' }}>
                            {w.avg_return > 0 ? '+' : ''}{Number(w.avg_return).toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>SIGNALS</div>
                          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {w.count}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {tab === 'top' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {topSignals.length === 0 ? (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '40px', textAlign: 'center' }}>
                  <p style={{ fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-secondary)' }}>No measured signal outcomes yet.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['Ticker', 'Signal', 'Score', 'Entry Date', 'Return', 'Period'].map(h => (
                          <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {topSignals.map((sig, i) => (
                        <motion.tr key={`${sig.ticker}-${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                          style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px', fontFamily: 'Cormorant Garamond', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>{sig.ticker}</td>
                          <td style={{ padding: '12px' }}>
                            <span style={{
                              fontFamily: 'IBM Plex Mono', fontSize: '10px', fontWeight: 600,
                              color: SIGNAL_COLORS[sig.signal] || '#6b7280',
                              background: (SIGNAL_COLORS[sig.signal] || '#6b7280') + '15',
                              padding: '3px 8px', borderRadius: '4px',
                            }}>{sig.signal}</span>
                          </td>
                          <td style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', color: 'var(--text-primary)' }}>{sig.score}</td>
                          <td style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-secondary)' }}>{sig.entry_date?.split('T')[0]}</td>
                          <td style={{
                            padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', fontWeight: 600,
                            color: sig.realized_return > 0 ? 'var(--signal-green)' : sig.realized_return < 0 ? '#ef4444' : 'var(--text-primary)',
                          }}>
                            {sig.realized_return != null ? `${sig.realized_return > 0 ? '+' : ''}${Number(sig.realized_return).toFixed(1)}%` : '\u2014'}
                          </td>
                          <td style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-dim)' }}>{sig.period || '\u2014'}</td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
