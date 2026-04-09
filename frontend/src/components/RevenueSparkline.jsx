/**
 * RevenueSparkline — Compact revenue trend bar chart over 3-5 years.
 * Green bars for YoY growth, red for YoY decline.
 * Shows CAGR below the chart.
 */
export default function RevenueSparkline({ revenueHistory, cagr: cagrProp }) {
  if (!revenueHistory || revenueHistory.filter(v => v != null).length < 2) {
    return (
      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)' }}>
        — Insufficient data
      </div>
    );
  }

  const values = revenueHistory.filter(v => v != null);
  const max = Math.max(...values);
  const barWidth = 100 / revenueHistory.length;

  // CAGR calculation
  const first = values[0];
  const last = values[values.length - 1];
  const years = values.length - 1;
  const cagr = cagrProp != null ? cagrProp
    : first > 0 && years > 0
      ? (Math.pow(last / first, 1 / years) - 1) * 100
      : null;

  return (
    <div>
      <svg width="100%" height="48" viewBox="0 0 100 48" preserveAspectRatio="none">
        {revenueHistory.map((val, i) => {
          if (val == null) return null;
          const prevVal = i > 0 ? revenueHistory[i - 1] : null;
          const grew = prevVal != null ? val >= prevVal : null;
          const h = max > 0 ? (val / max) * 40 : 0;
          const barColor = grew === null ? 'rgba(255,255,255,0.5)' : grew ? 'var(--signal-green)' : 'var(--red, #ef4444)';
          return (
            <rect
              key={i}
              x={i * barWidth + barWidth * 0.15}
              y={44 - h}
              width={barWidth * 0.7}
              height={h}
              rx="1"
              fill={barColor}
              opacity="0.85"
            />
          );
        })}
      </svg>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: 'IBM Plex Mono', fontSize: '10px', marginTop: '4px'
      }}>
        <span style={{ color: 'var(--text-dim)' }}>
          {values.length}yr trend
        </span>
        {cagr != null && (
          <span style={{ color: cagr >= 0 ? 'var(--signal-green)' : 'var(--red, #ef4444)', fontWeight: 500 }}>
            {cagr >= 0 ? '+' : ''}{cagr.toFixed(1)}% CAGR
          </span>
        )}
      </div>
    </div>
  );
}
