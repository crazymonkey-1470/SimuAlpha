import { motion } from 'framer-motion';

function f(v) { return v == null ? '—' : `$${Number(v).toFixed(2)}`; }

export default function FibTargets({ waveCount, currentPrice }) {
  if (!waveCount) {
    return (
      <div className="bg-bg-card border border-border p-6 text-center">
        <div className="text-text-secondary font-mono text-xs">No price targets available</div>
      </div>
    );
  }

  const { entry_zone, stop_loss, target_1, target_2, reward_risk_ratio, current_wave, wave_structure, confidence_score } = waveCount;
  const price = currentPrice != null ? Number(currentPrice) : null;

  // Calculate distances from current price
  const distEntry = price && entry_zone ? (((entry_zone - price) / price) * 100).toFixed(1) : null;
  const distStop = price && stop_loss ? (((stop_loss - price) / price) * 100).toFixed(1) : null;
  const distT1 = price && target_1 ? (((target_1 - price) / price) * 100).toFixed(1) : null;
  const distT2 = price && target_2 ? (((target_2 - price) / price) * 100).toFixed(1) : null;

  // Scale-in suggestion based on wave position
  let scaleNote = null;
  if (current_wave === 'C' || current_wave === '2') {
    if (confidence_score >= 80) scaleNote = 'High confidence — consider full position size';
    else if (confidence_score >= 60) scaleNote = 'Probable setup — consider 50-75% position, scale in on confirmation';
    else scaleNote = 'Speculative — consider 25-50% starter position';
  }

  const levels = [
    { label: 'TARGET 2', value: target_2, dist: distT2, color: '#00ff88', icon: '>>>' },
    { label: 'TARGET 1', value: target_1, dist: distT1, color: '#4ade80', icon: '>>' },
    { label: 'CURRENT', value: price, dist: null, color: '#fff', icon: '•', isCurrent: true },
    { label: 'ENTRY ZONE', value: entry_zone, dist: distEntry, color: '#f5a623', icon: '>' },
    { label: 'STOP LOSS', value: stop_loss, dist: distStop, color: '#ff4466', icon: '×' },
  ].filter((l) => l.value != null);

  // Sort by price descending
  levels.sort((a, b) => Number(b.value) - Number(a.value));

  return (
    <div className="bg-bg-card border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-heading font-semibold text-[10px] text-green tracking-wider">PRICE TARGETS</h4>
        {reward_risk_ratio != null && (
          <span className="font-mono text-[10px] px-2 py-0.5 border"
            style={{
              color: reward_risk_ratio >= 3 ? '#00ff88' : reward_risk_ratio >= 2 ? '#f5a623' : '#ff4466',
              borderColor: reward_risk_ratio >= 3 ? '#00ff88' : reward_risk_ratio >= 2 ? '#f5a623' : '#ff4466',
            }}>
            R/R: {Number(reward_risk_ratio).toFixed(1)}x
          </span>
        )}
      </div>

      {/* Vertical Price Ladder */}
      <div className="space-y-0">
        {levels.map((level, i) => (
          <motion.div key={level.label}
            initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`flex items-center justify-between py-2 px-3 border-l-2 ${i < levels.length - 1 ? 'border-b border-b-border/20' : ''}`}
            style={{ borderLeftColor: level.color, backgroundColor: level.isCurrent ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono w-4 text-center" style={{ color: level.color }}>{level.icon}</span>
              <span className={`text-[10px] font-mono tracking-wider ${level.isCurrent ? 'font-bold' : ''}`} style={{ color: level.color }}>
                {level.label}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className={`font-mono text-sm ${level.isCurrent ? 'font-bold' : ''}`} style={{ color: level.color }}>
                {f(level.value)}
              </span>
              {level.dist != null && (
                <span className="text-[9px] font-mono text-text-dim w-12 text-right">
                  {Number(level.dist) > 0 ? '+' : ''}{level.dist}%
                </span>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Scale-in Suggestion */}
      {scaleNote && (
        <div className="mt-3 p-2 border border-border/40 bg-bg">
          <div className="text-[9px] font-mono text-text-secondary uppercase tracking-wider mb-0.5">POSITION SIZING</div>
          <div className="text-[10px] font-mono text-text-primary">{scaleNote}</div>
        </div>
      )}

      {/* Wave Context */}
      <div className="mt-3 text-[9px] font-mono text-text-dim">
        Based on {wave_structure} Wave {current_wave} · {confidence_score}% confidence
      </div>
    </div>
  );
}
