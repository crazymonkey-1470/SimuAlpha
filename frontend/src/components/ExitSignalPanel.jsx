import { useExitSignals } from '../hooks/useScreener';

const SEVERITY_COLORS = {
  HIGH: { bg: '#fef2f2', border: '#ef4444', text: '#dc2626', badge: '#dc2626' },
  MEDIUM: { bg: '#fffbeb', border: '#f59e0b', text: '#d97706', badge: '#d97706' },
  LOW: { bg: '#f0fdf4', border: '#22c55e', text: '#16a34a', badge: '#16a34a' },
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
  const { data: signals, loading, acknowledge } = useExitSignals();

  if (loading) return <div style={{ padding: '1rem', color: '#94a3b8' }}>Loading exit signals...</div>;
  if (!signals || signals.length === 0) {
    return (
      <div style={{ background: '#f0fdf4', border: '1px solid #22c55e', borderRadius: 8, padding: '1rem', margin: '1rem 0' }}>
        <strong style={{ color: '#16a34a' }}>No Active Exit Signals</strong>
        <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
          All positions are within acceptable parameters.
        </p>
      </div>
    );
  }

  return (
    <div style={{ margin: '1rem 0' }}>
      <h3 style={{ margin: '0 0 0.75rem', color: '#e2e8f0' }}>
        Exit Signals ({signals.length} active)
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {signals.map((sig) => {
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
                  }}>
                    {sig.severity}
                  </span>
                  <strong style={{ color: colors.text, fontSize: '0.95rem' }}>{sig.ticker}</strong>
                  <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{label}</span>
                  <span style={{ color: '#94a3b8', fontSize: '0.75rem', marginLeft: 'auto' }}>{age}</span>
                </div>
                <p style={{ margin: 0, color: '#475569', fontSize: '0.82rem', lineHeight: 1.4 }}>
                  {sig.signal_reason}
                </p>
                {sig.price_at_signal && (
                  <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
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
                  whiteSpace: 'nowrap',
                }}
              >
                Dismiss
              </button>
            </div>
          );
        })}
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
