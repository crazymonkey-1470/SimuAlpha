import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import SignalBadge from '../components/SignalBadge';
import usePageTitle from '../hooks/usePageTitle';
import { useToast } from '../components/Toast';

const TRIM_REASONS = ['Wave 3 target hit', 'Wave 5 exhaustion', 'Thesis broken', 'Rebalancing', 'Other'];

export default function Portfolio() {
  usePageTitle('Portfolio');
  const navigate = useNavigate();
  const { success } = useToast();
  const [positions, setPositions] = useState([]);
  const [summary, setSummary] = useState({});
  const [closed, setClosed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [trimModal, setTrimModal] = useState(null);

  async function fetchData() {
    const [posRes, closedRes] = await Promise.all([
      fetch('/api/portfolio').then(r => r.json()),
      fetch('/api/portfolio/closed').then(r => r.json()),
    ]);
    setPositions(posRes.positions || []);
    setSummary(posRes.summary || {});
    setClosed(closedRes || []);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  const fmtMoney = (v) => v != null ? `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '\u2014';
  const fmtPct = (v) => v != null ? `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}%` : '\u2014';
  const pnlColor = (v) => v > 0 ? 'var(--signal-green)' : v < 0 ? '#ef4444' : 'var(--text-primary)';

  return (
    <div style={{ paddingTop: '40px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontFamily: 'Cormorant Garamond', fontSize: '48px', fontWeight: 300, color: 'var(--text-primary)', marginBottom: '8px' }}>
          Portfolio
        </h1>
        <p style={{ fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-secondary)' }}>
          Track your actual positions and see real P&L against SimuAlpha's recommendations.
        </p>
      </div>

      {loading ? <LoadingSpinner /> : (
        <>
          {/* Summary */}
          {summary.total_positions > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '32px' }}>
              {[
                { label: 'TOTAL VALUE', value: fmtMoney(summary.total_value) },
                { label: 'COST BASIS', value: fmtMoney(summary.total_cost) },
                { label: 'P&L', value: fmtMoney(summary.total_pnl), color: pnlColor(summary.total_pnl) },
                { label: 'RETURN', value: fmtPct(summary.total_pnl_pct), color: pnlColor(summary.total_pnl_pct) },
                { label: 'POSITIONS', value: summary.total_positions },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', letterSpacing: '0.1em', marginBottom: '4px' }}>{s.label}</div>
                  <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '20px', fontWeight: 600, color: s.color || 'var(--text-primary)' }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Open positions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '24px', color: 'var(--text-primary)' }}>Open Positions</div>
            <button onClick={() => setShowAdd(true)} style={{
              background: 'var(--signal-green-dim)', border: '1px solid var(--signal-green)40',
              borderRadius: '6px', padding: '8px 16px', color: 'var(--signal-green)',
              fontFamily: 'IBM Plex Mono', fontSize: '11px', cursor: 'pointer',
            }}>+ Add Position</button>
          </div>

          {positions.length === 0 ? (
            <EmptyState message="No open positions" sub="Add your first position to start tracking P&L." />
          ) : (
            <div style={{ overflowX: 'auto', marginBottom: '40px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Ticker', 'Shares', 'Entry', 'Current', 'P&L', 'Return', 'Score', 'Signal', ''].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos, i) => (
                    <motion.tr key={pos.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                      style={{ borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${pnlColor(pos.pnl)}` }}>
                      <td onClick={() => navigate(`/ticker/${pos.ticker}`)} style={{ padding: '12px', cursor: 'pointer' }}>
                        <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>{pos.ticker}</div>
                        {pos.notes && <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-dim)' }}>{pos.notes}</div>}
                      </td>
                      <td style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', color: 'var(--text-primary)' }}>{pos.shares}</td>
                      <td style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', color: 'var(--text-secondary)' }}>{fmtMoney(pos.entry_price)}</td>
                      <td style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', color: 'var(--text-primary)' }}>{fmtMoney(pos.current_price)}</td>
                      <td style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', fontWeight: 600, color: pnlColor(pos.pnl) }}>{fmtMoney(pos.pnl)}</td>
                      <td style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', color: pnlColor(pos.pnl_pct) }}>{fmtPct(pos.pnl_pct)}</td>
                      <td style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', color: 'var(--text-primary)' }}>{pos.current_score ?? '\u2014'}</td>
                      <td style={{ padding: '12px' }}>{pos.current_signal ? <SignalBadge signal={pos.current_signal} size="sm" /> : '\u2014'}</td>
                      <td style={{ padding: '12px' }}>
                        <button onClick={() => setTrimModal(pos)} style={{
                          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                          borderRadius: '4px', padding: '3px 10px', color: '#f87171',
                          fontFamily: 'IBM Plex Mono', fontSize: '10px', cursor: 'pointer',
                        }}>Trim</button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Closed positions */}
          {closed.length > 0 && (
            <>
              <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '24px', color: 'var(--text-primary)', marginBottom: '16px' }}>
                Closed Positions
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '32px' }}>
                {closed.slice(0, 10).map(pos => (
                  <div key={pos.id} style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px',
                    display: 'flex', alignItems: 'center', gap: '16px',
                  }}>
                    <span style={{ fontFamily: 'Cormorant Garamond', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', width: '60px' }}>{pos.ticker}</span>
                    <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-secondary)' }}>
                      Bought {fmtMoney(pos.entry_price)} &rarr; Sold {fmtMoney(pos.exit_price)}
                    </span>
                    <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '13px', fontWeight: 600, color: pnlColor(pos.pnl_pct) }}>
                      {fmtPct(pos.pnl_pct)}
                    </span>
                    <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)', marginLeft: 'auto' }}>
                      {pos.hold_days}d hold
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Add Position Modal */}
      <AnimatePresence>
        {showAdd && <AddPositionModal onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); success('Position added'); fetchData(); }} />}
        {trimModal && <TrimModal position={trimModal} onClose={() => setTrimModal(null)} onTrimmed={() => { setTrimModal(null); success('Position updated'); fetchData(); }} />}
      </AnimatePresence>
    </div>
  );
}

function AddPositionModal({ onClose, onAdded }) {
  const [ticker, setTicker] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [shares, setShares] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [tranche, setTranche] = useState(1);
  const [notes, setNotes] = useState('');

  async function handleSubmit() {
    if (!ticker || !entryPrice || !shares) return;
    await fetch('/api/portfolio', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, entry_price: Number(entryPrice), shares: Number(shares), entry_date: date, tranche_number: tranche, notes }),
    });
    onAdded();
  }

  const inputStyle = { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 14px', color: 'var(--text-primary)', fontFamily: 'IBM Plex Mono', fontSize: '13px', outline: 'none', width: '100%' };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px', width: '400px', maxWidth: '90vw' }}>
        <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '24px', color: 'var(--text-primary)', marginBottom: '20px' }}>Add Position</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="Ticker" style={inputStyle} />
          <input type="number" value={entryPrice} onChange={e => setEntryPrice(e.target.value)} placeholder="Entry Price" step="0.01" style={inputStyle} />
          <input type="number" value={shares} onChange={e => setShares(e.target.value)} placeholder="Shares" style={inputStyle} />
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-secondary)' }}>Tranche</span>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => setTranche(n)} style={{
                background: tranche === n ? 'var(--signal-green-dim)' : 'transparent',
                border: `1px solid ${tranche === n ? 'var(--signal-green)40' : 'var(--border)'}`,
                borderRadius: '4px', width: '28px', height: '28px', color: tranche === n ? 'var(--signal-green)' : 'var(--text-dim)',
                fontFamily: 'IBM Plex Mono', fontSize: '11px', cursor: 'pointer',
              }}>{n}</button>
            ))}
          </div>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" style={inputStyle} />
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button onClick={handleSubmit} style={{
              flex: 1, background: 'var(--signal-green)', border: 'none', borderRadius: '8px', padding: '12px',
              color: '#0c0c0e', fontFamily: 'IBM Plex Mono', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            }}>Add Position</button>
            <button onClick={onClose} style={{
              background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 20px',
              color: 'var(--text-secondary)', fontFamily: 'IBM Plex Mono', fontSize: '12px', cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function TrimModal({ position, onClose, onTrimmed }) {
  const [sharesToSell, setSharestoSell] = useState('');
  const [price, setPrice] = useState(position.current_price?.toString() || '');
  const [reason, setReason] = useState(TRIM_REASONS[0]);

  async function handleTrim() {
    if (!sharesToSell || !price) return;
    await fetch(`/api/portfolio/${position.id}/trim`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shares_to_sell: Number(sharesToSell), price: Number(price), reason }),
    });
    onTrimmed();
  }

  const inputStyle = { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 14px', color: 'var(--text-primary)', fontFamily: 'IBM Plex Mono', fontSize: '13px', outline: 'none', width: '100%' };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px', width: '400px', maxWidth: '90vw' }}>
        <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '24px', color: 'var(--text-primary)', marginBottom: '4px' }}>Trim {position.ticker}</div>
        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Current: {position.shares} shares @ ${Number(position.current_price).toFixed(2)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input type="number" value={sharesToSell} onChange={e => setSharestoSell(e.target.value)} placeholder="Shares to sell" max={position.shares} style={inputStyle} />
          <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="Sell price" step="0.01" style={inputStyle} />
          <select value={reason} onChange={e => setReason(e.target.value)} style={inputStyle}>
            {TRIM_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button onClick={handleTrim} style={{
              flex: 1, background: '#ef4444', border: 'none', borderRadius: '8px', padding: '12px',
              color: '#fff', fontFamily: 'IBM Plex Mono', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            }}>{Number(sharesToSell) >= position.shares ? 'Close Position' : 'Trim Position'}</button>
            <button onClick={onClose} style={{
              background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 20px',
              color: 'var(--text-secondary)', fontFamily: 'IBM Plex Mono', fontSize: '12px', cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
