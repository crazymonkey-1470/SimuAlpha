import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useSignalAlerts } from '../hooks/useScreener';
import SignalBadge from '../components/SignalBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

const alertTypeLabel = {
  'LOAD_THE_BOAT': 'Load The Boat',
  'SIGNAL_UPGRADE': 'Signal Upgrade',
  'CROSSED_200WMA': 'Crossed 200WMA',
  'CROSSED_200MMA': 'Crossed 200MMA',
  'WAVE_BUY_ZONE': 'Wave Buy Zone',
};

export default function Signals() {
  const navigate = useNavigate();
  const { data: alerts, loading } = useSignalAlerts();

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
          Every opportunity the system has detected. Most recent first.
        </p>
      </div>

      {loading ? (
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
                  <SignalBadge signal={alert.new_signal} size="sm" />
                </div>
                <span style={{
                  fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-dim)'
                }}>
                  {new Date(alert.fired_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  })}
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
                    <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-primary)' }}>${alert.current_price?.toFixed(2)}</span>
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
    </div>
  );
}
