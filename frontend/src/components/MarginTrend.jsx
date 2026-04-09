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
        — Insufficient data
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

  const displayMargin = grossMarginCurrent != null ? grossMarginCurrent : last;

  return (
    <div>
      {/* Current margin prominently above chart */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '6px' }}>
        <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {displayMargin.toFixed(1)}%
        </span>
        <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '16px', fontWeight: 500, color: trendColor }}>
          {arrow}
        </span>
      </div>
      <svg width="100%" height="48" viewBox="0 0 100 48" preserveAspectRatio="none">
        <path d={pathD} fill="none" stroke={trendColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {values.map((v, i) => {
          const x = (i / (values.length - 1)) * 100;
          const y = 44 - ((v - min) / range) * 40;
          return <circle key={i} cx={x} cy={y} r="2" fill={trendColor} />;
        })}
      </svg>
      <div style={{
        fontFamily: 'IBM Plex Mono', fontSize: '10px', marginTop: '4px', color: 'var(--text-dim)'
      }}>
        {values.length}yr gross margin trend
      </div>
    </div>
  );
}
