/**
 * MADistanceBar — Visual bar showing price position relative to 200WMA and 200MMA.
 * Left (green) = at/below MAs. Middle (amber) = within 15%. Right (white) = extended.
 */
export default function MADistanceBar({ currentPrice, price200wma, price200mma, pctFrom200wma, pctFrom200mma }) {
  if (currentPrice == null || (price200wma == null && price200mma == null)) {
    return (
      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)' }}>
        MA data unavailable
      </div>
    );
  }

  // Map percentage to bar position (0-100)
  // -20% to +30% range displayed
  const mapPct = (pct) => {
    if (pct == null) return null;
    const clamped = Math.max(-20, Math.min(30, pct));
    return ((clamped + 20) / 50) * 100;
  };

  const pricePos = mapPct(pctFrom200wma ?? pctFrom200mma);
  const wmaPos = mapPct(0); // WMA is always at 0% from itself
  const mmaPos = mapPct(0);

  const colorForPct = (pct) => {
    if (pct == null) return 'var(--text-secondary)';
    if (pct <= 0) return 'var(--signal-green)';
    if (pct <= 15) return 'var(--signal-amber)';
    return 'var(--text-primary)';
  };

  return (
    <div>
      {/* Bar background with zones */}
      <div style={{
        position: 'relative', height: '24px', borderRadius: '4px', overflow: 'hidden',
        background: 'var(--bg-secondary)', border: '1px solid var(--border)'
      }}>
        {/* Green zone: 0-40% of bar (represents <= 0% from MA) */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '40%', background: 'rgba(34,197,94,0.08)' }} />
        {/* Amber zone: 40-70% */}
        <div style={{ position: 'absolute', left: '40%', top: 0, bottom: 0, width: '30%', background: 'rgba(245,158,11,0.05)' }} />

        {/* MA reference line */}
        <div style={{ position: 'absolute', left: '40%', top: 0, bottom: 0, width: '1px', background: 'var(--border-light)' }} />

        {/* Price dot */}
        {pricePos != null && (
          <div style={{
            position: 'absolute', left: `${pricePos}%`, top: '50%', transform: 'translate(-50%, -50%)',
            width: '10px', height: '10px', borderRadius: '50%',
            background: colorForPct(pctFrom200wma ?? pctFrom200mma),
            border: '2px solid var(--bg-card)', boxShadow: '0 0 4px rgba(0,0,0,0.3)'
          }} />
        )}
      </div>

      {/* Labels */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: '6px',
        fontFamily: 'IBM Plex Mono', fontSize: '10px'
      }}>
        {price200wma != null && (
          <div>
            <span style={{ color: 'var(--text-dim)' }}>200WMA </span>
            <span style={{ color: colorForPct(pctFrom200wma) }}>
              ${price200wma.toFixed(2)} ({pctFrom200wma > 0 ? '+' : ''}{pctFrom200wma?.toFixed(1)}%)
            </span>
          </div>
        )}
        {price200mma != null && (
          <div>
            <span style={{ color: 'var(--text-dim)' }}>200MMA </span>
            <span style={{ color: colorForPct(pctFrom200mma) }}>
              ${price200mma.toFixed(2)} ({pctFrom200mma > 0 ? '+' : ''}{pctFrom200mma?.toFixed(1)}%)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
