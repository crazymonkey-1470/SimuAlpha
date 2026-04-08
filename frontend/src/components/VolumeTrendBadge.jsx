/**
 * VolumeTrendBadge — Compact badge showing volume trend direction.
 * UP = accumulation (green), NEUTRAL (white), DOWN = distribution (red).
 */
export default function VolumeTrendBadge({ volumeTrend, volumeTrendRatio, compact = false }) {
  const config = {
    'UP': {
      color: 'var(--signal-green)',
      bg: 'var(--signal-green-dim)',
      arrow: '\u25B2',
      label: 'ACCUMULATION',
      shortLabel: 'ACC'
    },
    'NEUTRAL': {
      color: 'var(--text-secondary)',
      bg: 'transparent',
      arrow: '\u25AC',
      label: 'NEUTRAL VOLUME',
      shortLabel: 'NEU'
    },
    'DOWN': {
      color: 'var(--red, #ef4444)',
      bg: 'rgba(239,68,68,0.08)',
      arrow: '\u25BC',
      label: 'DISTRIBUTION',
      shortLabel: 'DIST'
    }
  };

  const c = config[volumeTrend] || config['NEUTRAL'];

  if (!volumeTrend) {
    return (
      <span style={{
        fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)'
      }}>
        {compact ? '\u2014' : 'Volume data unavailable'}
      </span>
    );
  }

  if (compact) {
    return (
      <span style={{
        fontFamily: 'IBM Plex Mono', fontSize: '10px', fontWeight: 500,
        color: c.color
      }}>
        {c.arrow} {c.shortLabel}
      </span>
    );
  }

  return (
    <div style={{
      display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
      padding: '6px 10px', borderRadius: '6px',
      background: c.bg, border: `1px solid ${c.color}20`
    }}>
      <div style={{
        fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 500,
        color: c.color
      }}>
        {c.arrow} {c.label}
      </div>
      {volumeTrendRatio != null && (
        <div style={{
          fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-dim)',
          marginTop: '2px'
        }}>
          Vol ratio: {volumeTrendRatio.toFixed(2)}x
        </div>
      )}
    </div>
  );
}
