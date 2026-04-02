import { motion } from 'framer-motion';

const WAVE_COLORS = {
  impulse: '#00ff88',
  corrective: '#f5a623',
};

const SIGNAL_COLORS = {
  BUY_ZONE: '#00ff88',
  ACCUMULATE_ZONE: '#4ade80',
  AVOID: '#ff4466',
  NEUTRAL: '#888',
};

function ConfidenceBadge({ score, label }) {
  const color = score >= 80 ? '#00ff88' : score >= 60 ? '#f5a623' : '#888';
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 border text-[9px] font-mono tracking-wider"
      style={{ borderColor: color, color }}>
      {label || 'SPECULATIVE'} ({score}%)
    </span>
  );
}

function WaveLabel({ wave, structure }) {
  const color = WAVE_COLORS[structure] || '#888';
  return (
    <span className="font-mono font-bold text-sm" style={{ color }}>
      Wave {wave}
    </span>
  );
}

export default function WaveChart({ waveCounts = [] }) {
  if (!waveCounts || waveCounts.length === 0) {
    return (
      <div className="bg-bg-card border border-border p-6 text-center">
        <div className="text-text-secondary font-mono text-xs">No wave counts available</div>
        <div className="text-text-dim font-mono text-[10px] mt-1">
          Wave analysis runs on ACCUMULATE and LOAD THE BOAT candidates
        </div>
      </div>
    );
  }

  // Group by timeframe
  const monthly = waveCounts.filter((w) => w.timeframe === 'monthly');
  const weekly = waveCounts.filter((w) => w.timeframe === 'weekly');

  return (
    <div className="space-y-3">
      {[{ label: 'MONTHLY', data: monthly }, { label: 'WEEKLY', data: weekly }]
        .filter((g) => g.data.length > 0)
        .map((group) => (
          <div key={group.label} className="bg-bg-card border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-heading font-semibold text-[10px] text-text-secondary tracking-wider">{group.label}</h4>
            </div>

            <div className="space-y-3">
              {group.data.map((wc, i) => {
                const signalColor = SIGNAL_COLORS[wc.tli_signal] || '#888';
                return (
                  <motion.div key={i}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="border-l-2 pl-3 py-2"
                    style={{ borderLeftColor: signalColor }}>

                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <WaveLabel wave={wc.current_wave} structure={wc.wave_structure} />
                        <span className="text-[9px] font-mono text-text-secondary uppercase">
                          {wc.wave_structure} · {wc.wave_degree}
                        </span>
                      </div>
                      <ConfidenceBadge score={wc.confidence_score} label={wc.confidence_label} />
                    </div>

                    {/* TLI Signal */}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] font-mono font-medium" style={{ color: signalColor }}>
                        {wc.tli_signal?.replace(/_/g, ' ')}
                      </span>
                      {wc.tli_reason && (
                        <span className="text-[9px] font-mono text-text-dim">— {wc.tli_reason}</span>
                      )}
                    </div>

                    {/* Wave Structure Visual */}
                    <div className="mt-2 flex items-end gap-0.5 h-8">
                      {wc.wave_structure === 'impulse'
                        ? ['1', '2', '3', '4', '5'].map((w) => {
                            const isActive = w === wc.current_wave;
                            const heights = { '1': 40, '2': 25, '3': 70, '4': 35, '5': 55 };
                            return (
                              <div key={w} className="flex flex-col items-center gap-0.5">
                                <div className="transition-all duration-300"
                                  style={{
                                    width: 12,
                                    height: `${heights[w]}%`,
                                    backgroundColor: isActive ? '#00ff88' : '#333',
                                    border: isActive ? '1px solid #00ff88' : '1px solid #444',
                                  }} />
                                <span className={`text-[8px] font-mono ${isActive ? 'text-green font-bold' : 'text-text-dim'}`}>{w}</span>
                              </div>
                            );
                          })
                        : ['A', 'B', 'C'].map((w) => {
                            const isActive = w === wc.current_wave;
                            const heights = { A: 60, B: 35, C: 70 };
                            return (
                              <div key={w} className="flex flex-col items-center gap-0.5">
                                <div className="transition-all duration-300"
                                  style={{
                                    width: 14,
                                    height: `${heights[w]}%`,
                                    backgroundColor: isActive ? '#f5a623' : '#333',
                                    border: isActive ? '1px solid #f5a623' : '1px solid #444',
                                  }} />
                                <span className={`text-[8px] font-mono ${isActive ? 'text-amber font-bold' : 'text-text-dim'}`}>{w}</span>
                              </div>
                            );
                          })}
                    </div>

                    {/* Pivot count */}
                    <div className="text-[9px] font-mono text-text-dim mt-1">
                      {wc.pivot_count} pivots detected
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}
