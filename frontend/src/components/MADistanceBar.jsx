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
      {/* Zone labels */}
      <div style={{
        display: 'flex', marginBottom: '4px',
        fontFamily: 'IBM Plex Mono', fontSize: '9px', letterSpacing: '0.05em'
      }}>
        <span style={{ width: '40%', color: 'var(--signal-green)', opacity: 0.7 }}>ENTRY ZONE</span>
        <span style={{ width: '30%', color: 'var(--signal-amber)', opacity: 0.7 }}>APPROACHING</span>
        <span style={{ width: '30%', textAlign: 'right', color: 'var(--text-dim)' }}>EXTENDED</span>
      </div>

      {/* Bar background with zones */}
      <div style={{
        position: 'relative', height: '24px', borderRadius: '4px', overflow: 'hidden',
        background: 'var(--bg-secondary)', border: '1px solid var(--border)'
      }}>
        {/* Green zone: 0-40% of bar (represents <= 0% from MA) */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '40%', background: 'rgba(34,197,94,0.08)' }} />
        {/* Amber zone: 40-70% */}
        <div style={{ position: 'absolute', left: '40%', top: 0, bottom: 0, width: '30%', background: 'rgba(245,158,11,0.05)' }} />
        {/* White zone: 70-100% */}
        <div style={{ position: 'absolute', left: '70%', top: 0, bottom: 0, width: '30%', background: 'rgba(255,255,255,0.02)' }} />

        {/* MA reference line */}
        <div style={{ position: 'absolute', left: '40%', top: 0, bottom: 0, width: '1px', background: 'var(--border-light)' }} />

        {/* 200WMA marker dot */}
        {price200wma != null && (
          <div style={{
            position: 'absolute', left: `${wmaPos}%`, top: '50%', transform: 'translate(-50%, -50%)',
            width: '8px', height: '8px', borderRadius: '50%',
            background: 'var(--signal-amber)', opacity: 0.6,
            border: '1.5px solid var(--bg-card)'
          }} />
        )}

        {/* 200MMA marker dot */}
        {price200mma != null && (
          <div style={{
            position: 'absolute', left: `${mmaPos}%`, top: '50%', transform: 'translate(-50%, -50%)',
            width: '8px', height: '8px', borderRadius: '50%',
            background: 'var(--blue, #4a9eff)', opacity: 0.6,
            border: '1.5px solid var(--bg-card)'
          }} />
        )}

        {/* Current price dot (white, on top) */}
        {pricePos != null && (
          <div style={{
            position: 'absolute', left: `${pricePos}%`, top: '50%', transform: 'translate(-50%, -50%)',
            width: '10px', height: '10px', borderRadius: '50%',
            background: '#fff',
            border: '2px solid var(--bg-card)', boxShadow: '0 0 6px rgba(255,255,255,0.3)',
            zIndex: 2
          }} />
        )}
      </div>

      {/* Labels */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: '6px',
        fontFamily: 'IBM Plex Mono', fontSize: '10px'
      }}>
        {price200wma != null ? (
          <div>
            <span style={{ color: 'var(--text-dim)' }}>200WMA: </span>
            <span style={{ color: colorForPct(pctFrom200wma) }}>
              ${price200wma.toFixed(2)} ({pctFrom200wma != null ? `${Math.abs(pctFrom200wma).toFixed(1)}% ${pctFrom200wma <= 0 ? 'below' : 'above'}` : ''})
            </span>
          </div>
        ) : (
          <div style={{ color: 'var(--text-dim)' }}>200WMA: N/A</div>
        )}
        {price200mma != null ? (
          <div>
            <span style={{ color: 'var(--text-dim)' }}>200MMA: </span>
            <span style={{ color: colorForPct(pctFrom200mma) }}>
              ${price200mma.toFixed(2)} ({pctFrom200mma != null ? `${Math.abs(pctFrom200mma).toFixed(1)}% ${pctFrom200mma <= 0 ? 'below' : 'above'}` : ''})
            </span>
          </div>
        ) : (
          <div style={{ color: 'var(--text-dim)' }}>200MMA: N/A</div>
        )}
      </div>
    </div>
  );
}
