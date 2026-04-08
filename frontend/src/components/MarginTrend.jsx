/**
 * MarginTrend — Gross margin % line chart over 3-5 years.
 * Green line if trending up, amber if flat, red if down.
 * Shows current gross margin prominently with direction arrow.
 */
export default function MarginTrend({ grossMarginHistory, grossMarginCurrent }) {
  const values = (grossMarginHistory || []).filter(v => v != null);

  if (values.length < 2) {
    return (
      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)' }}>
        Margin history unavailable
      </div>
    );
  }

  const min = Math.min(...values) - 2;
  const max = Math.max(...values) + 2;
  const range = max - min || 1;

  // Build SVG path
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * 100;
    const y = 44 - ((v - min) / range) * 40;
    return `${x},${y}`;
  });
  const pathD = `M ${points.join(' L ')}`;

  // Determine trend
  const first = values[0];
  const last = values[values.length - 1];
  const diff = last - first;
  const trendColor = diff > 2 ? 'var(--signal-green)' : diff < -2 ? 'var(--red, #ef4444)' : 'var(--signal-amber)';
  const arrow = diff > 2 ? '\u2191' : diff < -2 ? '\u2193' : '\u2192';

  return (
    <div>
      <svg width="100%" height="48" viewBox="0 0 100 48" preserveAspectRatio="none">
        <path d={pathD} fill="none" stroke={trendColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Dots at each point */}
        {values.map((v, i) => {
          const x = (i / (values.length - 1)) * 100;
          const y = 44 - ((v - min) / range) * 40;
          return <circle key={i} cx={x} cy={y} r="2" fill={trendColor} />;
        })}
      </svg>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: 'IBM Plex Mono', fontSize: '10px', marginTop: '4px'
      }}>
        <span style={{ color: 'var(--text-dim)' }}>Gross Margin</span>
        <span style={{ color: trendColor, fontWeight: 500 }}>
          {arrow} {grossMarginCurrent != null ? `${grossMarginCurrent.toFixed(1)}%` : `${last.toFixed(1)}%`}
        </span>
      </div>
    </div>
  );
}
