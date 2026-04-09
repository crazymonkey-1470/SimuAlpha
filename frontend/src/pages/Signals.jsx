import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useSignalAlerts, useExitSignals } from '../hooks/useScreener';
import SignalBadge from '../components/SignalBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { useState } from 'react';

const alertTypeLabel = {
  'LOAD_THE_BOAT': 'Load The Boat',
  'SIGNAL_UPGRADE': 'Signal Upgrade',
  'CROSSED_200WMA': 'Crossed 200WMA',
  'CROSSED_200MMA': 'Crossed 200MMA',
  'WAVE_BUY_ZONE': 'Wave Buy Zone',
};

function timeSince(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Signals() {
  const navigate = useNavigate();
  const { data: alerts, loading } = useSignalAlerts();
  const { data: exitSignals, loading: exitLoading } = useExitSignals();
  const [tab, setTab] = useState('entry');

  return (
    <div style={{ paddingTop: '40px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{
          fontFamily: 'Cormorant Garamond', fontSize: '48px',
          fontWeight: 300, color: 'var(--text-primary)', marginBottom: '8px'
        }}>
          Signals
        </h1>
        <p style={{
          fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-secondary)'
        }}>
          Every entry and exit signal the system has detected. Most recent first.
        </p>
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          {['entry', 'exit'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? 'var(--bg-card-hover)' : 'transparent',
              border: `1px solid ${tab === t ? 'var(--border-light)' : 'var(--border)'}`,
              borderRadius: '6px', padding: '6px 16px',
              color: tab === t ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontFamily: 'IBM Plex Mono', fontSize: '11px', cursor: 'pointer'
            }}>
              {t === 'entry' ? 'ENTRY SIGNALS' : `EXIT SIGNALS${exitSignals.length > 0 ? ` (${exitSignals.length})` : ''}`}
            </button>
          ))}
        </div>
      </div>

      {tab === 'exit' ? (
        exitLoading ? <LoadingSpinner /> : exitSignals.length === 0 ? (
          <EmptyState message="No exit signals yet" sub="Exit signals fire when wave targets are hit. They will appear after wave analysis detects target zones." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {exitSignals.map((es, i) => (
              <motion.div key={es.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                onClick={() => navigate(`/ticker/${es.ticker}`)}
                style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderLeft: `3px solid ${es.signal_type === 'WAVE_4_ADD_ZONE' ? 'var(--signal-green)' : 'var(--signal-amber)'}`,
                  borderRadius: '8px', padding: '20px 24px', cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'Cormorant Garamond', fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)' }}>{es.ticker}</span>
                    <SignalBadge signal={es.signal_type} size="sm" />
                  </div>
                  <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-dim)' }}>{timeSince(es.created_at)}</span>
                </div>
                <div style={{ marginTop: '12px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                  {es.price_at_signal && (
                    <div>
                      <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', marginRight: '8px' }}>PRICE</span>
                      <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-primary)' }}>${es.price_at_signal.toFixed(2)}</span>
                    </div>
                  )}
                  {es.target_price && (
                    <div>
                      <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', marginRight: '8px' }}>TARGET</span>
                      <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--signal-amber)' }}>${es.target_price.toFixed(2)}</span>
                    </div>
                  )}
                </div>
                {es.signal_reason && (
                  <div style={{ marginTop: '10px', fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>{es.signal_reason}</div>
                )}
              </motion.div>
            ))}
          </div>
        )
      ) : loading ? (
        <LoadingSpinner />
      ) : alerts.length === 0 ? (
        <EmptyState
          message="No signals yet"
          sub="Signals fire when a stock enters a TLI buy zone. Check back after the first full pipeline run."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {alerts.map((alert, i) => (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => navigate(`/ticker/${alert.ticker}`)}
              style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderLeft: alert.alert_type === 'LOAD_THE_BOAT'
                  ? '3px solid var(--signal-green)' : '3px solid var(--signal-amber)',
                borderRadius: '8px', padding: '20px 24px', cursor: 'pointer',
                transition: 'background 0.15s ease'
              }}
            >
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px'
              }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <span style={{
                    fontFamily: 'Cormorant Garamond', fontSize: '24px',
                    fontWeight: 600, color: 'var(--text-primary)'
                  }}>
                    {alert.ticker}
                  </span>
                  {alert.new_signal && <SignalBadge signal={alert.new_signal} size="sm" />}
                </div>
                <span style={{
                  fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-dim)'
                }}>
                  {alert.fired_at ? new Date(alert.fired_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  }) : ''}
                </span>
              </div>

              <div style={{
                marginTop: '12px', display: 'flex', gap: '24px', flexWrap: 'wrap'
              }}>
                <div>
                  <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', marginRight: '8px' }}>TYPE</span>
                  <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-primary)' }}>
                    {alertTypeLabel[alert.alert_type] || alert.alert_type}
                  </span>
                </div>
                {alert.score && (
                  <div>
                    <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', marginRight: '8px' }}>SCORE</span>
                    <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--signal-green)' }}>{alert.score}/100</span>
                  </div>
                )}
                {alert.current_price && (
                  <div>
                    <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', marginRight: '8px' }}>PRICE AT SIGNAL</span>
                    <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-primary)' }}>{alert.current_price != null ? `$${alert.current_price.toFixed(2)}` : '\u2014'}</span>
                  </div>
                )}
              </div>

              {alert.claude_narrative && (
                <div style={{
                  marginTop: '12px', padding: '10px 14px',
                  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                  borderRadius: '6px', fontFamily: 'IBM Plex Mono', fontSize: '11px',
                  color: 'var(--text-secondary)', lineHeight: 1.7, fontStyle: 'italic'
                }}>
                  &ldquo;{alert.claude_narrative}&rdquo;
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-dim)', padding: '20px 0', borderTop: '1px solid var(--border)', marginTop: '24px' }}>
        Not financial advice. AI-generated analysis for educational purposes only. Do your own research before investing.
      </div>
    </div>
  );
}
