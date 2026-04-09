/**
 * WavePositionIndicator — Visual showing 5-wave impulse or 3-wave corrective
 * structure with the current position highlighted.
 */
import SignalBadge from './SignalBadge';

const WAVE_COLORS = {
  '1': 'rgba(255,255,255,0.6)',
  '2': 'var(--signal-green)',
  '3': 'var(--red, #ef4444)',
  '4': 'var(--signal-amber)',
  '5': 'var(--red, #ef4444)',
  'A': 'var(--signal-amber)',
  'B': 'var(--red, #ef4444)',
  'C': 'var(--signal-green)',
};

const PULSE_WAVES = new Set(['2', 'C']);

export default function WavePositionIndicator({ waveStructure, currentWave, tliSignal, waveConfidence, compact = false }) {
  if (!waveStructure || !currentWave) {
    return null;
  }

  const isImpulse = waveStructure === 'impulse';
  const waves = isImpulse ? ['1', '2', '3', '4', '5'] : ['A', 'B', 'C'];

  // SVG path heights for wave shape visualization
  const impulseHeights = [30, 55, 10, 40, 15]; // Y positions (lower = higher on chart)
  const correctiveHeights = [15, 40, 55];

  const heights = isImpulse ? impulseHeights : correctiveHeights;

  if (compact) {
    return (
      <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
        {waves.map((w) => {
          const isCurrent = w === currentWave;
          const color = WAVE_COLORS[w];
          const shouldPulse = isCurrent && PULSE_WAVES.has(w);
          return (
            <div key={w} className={shouldPulse ? 'pulse-green' : ''} style={{
              width: '18px', height: '18px', borderRadius: '3px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isCurrent ? color : 'var(--bg-secondary)',
              border: `1px solid ${isCurrent ? color : 'var(--border)'}`,
              fontFamily: 'IBM Plex Mono', fontSize: '9px', fontWeight: 600,
              color: isCurrent ? '#fff' : 'var(--text-dim)'
            }}>
              {w}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      {/* Wave shape visualization */}
      <svg width="100%" height="60" viewBox={`0 0 ${waves.length * 28} 60`} preserveAspectRatio="none">
        {waves.map((w, i) => {
          const isCurrent = w === currentWave;
          const color = WAVE_COLORS[w];
          const x = i * 28 + 14;
          const y = heights[i];

          return (
            <g key={w}>
              {/* Line connecting to next wave */}
              {i < waves.length - 1 && (
                <line
                  x1={x} y1={y}
                  x2={(i + 1) * 28 + 14} y2={heights[i + 1]}
                  stroke={isCurrent ? color : 'var(--border-light)'}
                  strokeWidth={isCurrent ? 2 : 1}
                  opacity={0.6}
                />
              )}
              {/* Dot */}
              <circle cx={x} cy={y} r={isCurrent ? 6 : 4}
                fill={isCurrent ? color : 'var(--bg-secondary)'}
                stroke={isCurrent ? color : 'var(--border)'}
                strokeWidth={isCurrent ? 2 : 1}
              />
              {/* Label */}
              <text x={x} y={y > 35 ? y - 10 : y + 16}
                textAnchor="middle"
                style={{
                  fontFamily: 'IBM Plex Mono', fontSize: '9px', fontWeight: isCurrent ? 700 : 400,
                  fill: isCurrent ? color : 'var(--text-dim)'
                }}
              >
                {w}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Signal badge */}
      {tliSignal && (
        <div style={{ marginTop: '8px' }}>
          <SignalBadge signal={tliSignal} size="sm" />
        </div>
      )}
      {waveConfidence && (
        <div style={{
          fontFamily: 'IBM Plex Mono', fontSize: '9px', marginTop: '4px',
          color: waveConfidence === 'HIGH CONFIDENCE' ? 'var(--signal-green)' : waveConfidence === 'PROBABLE' ? 'var(--signal-amber)' : 'var(--text-dim)',
          letterSpacing: '0.05em'
        }}>
          {waveConfidence}
        </div>
      )}
    </div>
  );
}
