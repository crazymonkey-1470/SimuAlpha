import { useExitSignals } from '../hooks/useScreener';

const SEVERITY_COLORS = {
  HIGH: { bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.3)', text: '#f87171', badge: '#dc2626' },
  MEDIUM: { bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.3)', text: '#fbbf24', badge: '#d97706' },
  LOW: { bg: 'rgba(34, 197, 94, 0.06)', border: 'rgba(34, 197, 94, 0.2)', text: '#4ade80', badge: '#16a34a' },
};

const SIGNAL_LABELS = {
  VALUE_TRAP: 'Value Trap',
  THESIS_BROKEN: 'Thesis Broken',
  SCORE_COLLAPSE: 'Score Collapse',
  EARNINGS_QUALITY_WARNING: 'Earnings Quality',
  OVERVALUATION_EXIT: 'Overvaluation',
  WAVE_3_TARGET_HIT: 'Wave 3 Target',
  WAVE_5_TARGET_HIT: 'Wave 5 Target',
  WAVE_4_ADD_ZONE: 'Wave 4 Add',
  WAVE_B_REJECTION: 'Wave B Exit',
};

export default function ExitSignalPanel() {
  const { data: signals, loading, acknowledge, acknowledgeAll } = useExitSignals();

  if (loading) return <div style={{ padding: '1rem', color: '#94a3b8' }}>Loading exit signals...</div>;
  if (!signals || signals.length === 0) return null;

  // Show max 10 on dashboard
  const visible = signals.slice(0, 10);

  return (
    <div style={{ margin: '1rem 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, color: 'var(--text-primary)', fontFamily: 'IBM Plex Mono', fontSize: '13px' }}>
          Exit Signals ({signals.length} active)
        </h3>
        {signals.length > 0 && (
          <button
            onClick={acknowledgeAll}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '4px 10px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontFamily: 'IBM Plex Mono',
              fontSize: '10px',
            }}
          >
            Dismiss All
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {visible.map((sig) => {
          const colors = SEVERITY_COLORS[sig.severity] || SEVERITY_COLORS.MEDIUM;
          const label = SIGNAL_LABELS[sig.signal_type] || sig.signal_type;
          const age = getAge(sig.created_at);
          return (
            <div
              key={sig.id}
              style={{
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                padding: '0.75rem 1rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{
                    background: colors.badge,
                    color: '#fff',
                    padding: '0.1rem 0.5rem',
                    borderRadius: 4,
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    fontFamily: 'IBM Plex Mono',
                  }}>
                    {sig.severity}
                  </span>
                  <strong style={{ color: colors.text, fontSize: '0.95rem', fontFamily: 'IBM Plex Mono' }}>{sig.ticker}</strong>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'IBM Plex Mono' }}>{label}</span>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', marginLeft: 'auto', fontFamily: 'IBM Plex Mono' }}>{age}</span>
                </div>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.4, fontFamily: 'IBM Plex Mono' }}>
                  {sig.signal_reason}
                </p>
                {sig.price_at_signal && (
                  <span style={{ color: '#64748b', fontSize: '0.75rem', fontFamily: 'IBM Plex Mono' }}>
                    Price at signal: ${Number(sig.price_at_signal).toFixed(2)}
                    {sig.target_price ? ` | Target: $${Number(sig.target_price).toFixed(2)}` : ''}
                  </span>
                )}
              </div>
              <button
                onClick={() => acknowledge(sig.id)}
                style={{
                  background: 'transparent',
                  border: `1px solid ${colors.border}`,
                  borderRadius: 4,
                  padding: '0.25rem 0.5rem',
                  cursor: 'pointer',
                  color: colors.text,
                  fontSize: '0.75rem',
                  fontFamily: 'IBM Plex Mono',
                  whiteSpace: 'nowrap',
                }}
              >
                Dismiss
              </button>
            </div>
          );
        })}
        {signals.length > 10 && (
          <p style={{ color: '#64748b', fontSize: '0.75rem', textAlign: 'center', margin: '0.25rem 0 0', fontFamily: 'IBM Plex Mono' }}>
            +{signals.length - 10} more — view all on Signals page
          </p>
        )}
      </div>
    </div>
  );
}

function getAge(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
