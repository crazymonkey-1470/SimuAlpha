export default function MetricCard({ label, value, delta, highlight }) {
  const deltaColor = delta > 0
    ? 'var(--signal-green)'
    : delta < 0
    ? 'var(--red)'
    : 'var(--text-secondary)';

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${highlight ? 'var(--signal-green)30' : 'var(--border)'}`,
      borderRadius: '8px',
      padding: '16px',
      transition: 'border-color 0.2s ease'
    }}>
      <div style={{
        fontFamily: 'IBM Plex Mono',
        fontSize: '10px',
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        marginBottom: '8px'
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'IBM Plex Mono',
        fontSize: '20px',
        fontWeight: 500,
        color: highlight ? 'var(--signal-green)' : 'var(--text-primary)'
      }}>
        {value ?? '\u2014'}
      </div>
      {delta !== undefined && (
        <div style={{
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px',
          color: deltaColor,
          marginTop: '4px'
        }}>
          {delta > 0 ? '+' : ''}{delta?.toFixed(1)}%
        </div>
      )}
    </div>
  );
}
