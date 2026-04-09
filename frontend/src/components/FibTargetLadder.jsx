/**
 * FibTargetLadder — Vertical price ladder showing entry zone, targets, and stop loss.
 * Compact vertical display designed for card sidebars.
 */
export default function FibTargetLadder({ entryZoneLow, entryZoneHigh, stopLoss, target1, target2, currentPrice, rewardRiskRatio }) {
  const levels = [];

  if (target2 != null) levels.push({ label: 'T2', price: target2, color: 'var(--signal-green)', style: 'dashed' });
  if (target1 != null) levels.push({ label: 'T1', price: target1, color: 'var(--signal-amber)', style: 'dashed' });
  if (entryZoneHigh != null) levels.push({ label: 'Entry Hi', price: entryZoneHigh, color: 'var(--signal-green)', style: 'solid', isEntry: true });
  if (entryZoneLow != null) levels.push({ label: 'Entry Lo', price: entryZoneLow, color: 'var(--signal-green)', style: 'solid', isEntry: true });
  if (stopLoss != null) levels.push({ label: 'Stop', price: stopLoss, color: 'var(--red, #ef4444)', style: 'solid', isStop: true });

  if (levels.length === 0) {
    return (
      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)' }}>
        No Fib targets available
      </div>
    );
  }

  // Sorted high to low
  levels.sort((a, b) => b.price - a.price);

  // Check if current price is inside entry zone
  const inEntryZone = currentPrice != null && entryZoneLow != null && entryZoneHigh != null
    && currentPrice >= entryZoneLow && currentPrice <= entryZoneHigh;

  const pctGain = (price) => {
    if (currentPrice == null || currentPrice === 0) return '';
    const pct = ((price - currentPrice) / currentPrice) * 100;
    return pct >= 0 ? `+${pct.toFixed(0)}%` : `${pct.toFixed(0)}%`;
  };

  // Calculate separate R/R ratios
  const risk = currentPrice != null && stopLoss != null ? currentPrice - stopLoss : null;
  const rrT1 = risk > 0 && target1 != null ? ((target1 - currentPrice) / risk) : null;
  const rrT2 = risk > 0 && target2 != null ? ((target2 - currentPrice) / risk) : null;

  return (
    <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px' }}>
      {levels.map((level, i) => (
        <div key={i}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '4px 0',
            borderBottom: `1px ${level.style} ${level.color}30`,
            background: level.isEntry
              ? inEntryZone ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.04)'
              : 'transparent',
            animation: level.isEntry && inEntryZone ? 'pulse-green 2s infinite' : 'none'
          }}>
            <span style={{ color: level.color, fontWeight: 500, width: '50px' }}>
              {level.label}
            </span>
            <span style={{ color: 'var(--text-primary)' }}>
              ${level.price.toFixed(2)}
            </span>
            <span style={{ color: level.color, fontSize: '9px', width: '40px', textAlign: 'right' }}>
              {pctGain(level.price)}
            </span>
          </div>
          {level.isStop && (
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-dim)', fontStyle: 'italic', padding: '2px 0 4px' }}>
              Wave invalidation
            </div>
          )}
        </div>
      ))}

      {/* Current price marker */}
      {currentPrice != null && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', padding: '6px 0',
          borderTop: '1px solid var(--border-light)', marginTop: '4px'
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>Now</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>${currentPrice.toFixed(2)}</span>
        </div>
      )}

      {/* R/R Ratios */}
      {(rrT1 != null || rrT2 != null || rewardRiskRatio != null) && (
        <div style={{
          marginTop: '6px', padding: '4px 8px', borderRadius: '4px',
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: '2px'
        }}>
          {rrT1 != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>R/R to T1:</span>
              <span style={{ color: rrT1 >= 2 ? 'var(--signal-green)' : 'var(--text-secondary)', fontWeight: 500 }}>
                {rrT1.toFixed(1)}x
              </span>
            </div>
          )}
          {rrT2 != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>R/R to T2:</span>
              <span style={{ color: rrT2 >= 2 ? 'var(--signal-green)' : 'var(--text-secondary)', fontWeight: 500 }}>
                {rrT2.toFixed(1)}x
              </span>
            </div>
          )}
          {rrT1 == null && rrT2 == null && rewardRiskRatio != null && (
            <div style={{ textAlign: 'center' }}>
              <span style={{ color: rewardRiskRatio >= 2 ? 'var(--signal-green)' : 'var(--text-secondary)', fontWeight: 500 }}>
                R/R {rewardRiskRatio.toFixed(1)}x
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
