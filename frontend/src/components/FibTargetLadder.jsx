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
  if (stopLoss != null) levels.push({ label: 'Stop', price: stopLoss, color: 'var(--red, #ef4444)', style: 'solid' });

  if (levels.length === 0) {
    return (
      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)' }}>
        No Fib targets available
      </div>
    );
  }

  // Sorted high to low
  levels.sort((a, b) => b.price - a.price);

  const pctGain = (price) => {
    if (currentPrice == null || currentPrice === 0) return '';
    const pct = ((price - currentPrice) / currentPrice) * 100;
    return pct >= 0 ? `+${pct.toFixed(0)}%` : `${pct.toFixed(0)}%`;
  };

  return (
    <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px' }}>
      {levels.map((level, i) => (
        <div key={i} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '4px 0',
          borderBottom: `1px ${level.style} ${level.color}30`,
          background: level.isEntry ? 'rgba(34,197,94,0.04)' : 'transparent'
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

      {/* R/R Ratio */}
      {rewardRiskRatio != null && (
        <div style={{
          marginTop: '6px', padding: '4px 8px', borderRadius: '4px',
          background: rewardRiskRatio >= 2 ? 'var(--signal-green-dim)' : 'var(--bg-secondary)',
          border: `1px solid ${rewardRiskRatio >= 2 ? 'var(--signal-green)30' : 'var(--border)'}`,
          textAlign: 'center'
        }}>
          <span style={{ color: rewardRiskRatio >= 2 ? 'var(--signal-green)' : 'var(--text-secondary)', fontWeight: 500 }}>
            R/R {rewardRiskRatio.toFixed(1)}x
          </span>
        </div>
      )}
    </div>
  );
}
