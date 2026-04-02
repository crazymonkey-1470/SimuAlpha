import { useState } from 'react';
import { motion } from 'framer-motion';

function f(v, d = 1) { return v == null ? '—' : Number(v).toFixed(d); }

const OUTCOME_COLORS = {
  TARGET_2_HIT: '#00ff88',
  TARGET_1_HIT: '#4ade80',
  STOPPED_OUT: '#ff4466',
  OPEN: '#f5a623',
};

function StatBox({ label, value, color, suffix = '' }) {
  return (
    <div className="bg-bg border border-border p-3 text-center">
      <div className="text-[9px] font-mono text-text-secondary uppercase tracking-wider mb-1">{label}</div>
      <div className="font-mono font-medium text-lg" style={{ color: color || '#fff' }}>
        {value}{suffix}
      </div>
    </div>
  );
}

export default function BacktestCard({ summary, signals = [] }) {
  const [showAll, setShowAll] = useState(false);

  if (!summary) {
    return (
      <div className="bg-bg-card border border-border p-6 text-center">
        <div className="text-text-secondary font-mono text-xs">No backtest data available</div>
        <div className="text-text-dim font-mono text-[10px] mt-1">
          Requires 6+ years of monthly price history
        </div>
      </div>
    );
  }

  const winColor = summary.win_rate_pct >= 60 ? '#00ff88' : summary.win_rate_pct >= 40 ? '#f5a623' : '#ff4466';
  const returnColor = summary.avg_return_pct > 0 ? '#00ff88' : '#ff4466';
  const spyColor = summary.vs_spy_pct > 0 ? '#00ff88' : summary.vs_spy_pct < 0 ? '#ff4466' : '#888';

  const displaySignals = showAll ? signals : signals.slice(0, 5);

  return (
    <div className="bg-bg-card border border-border p-4">
      <h4 className="font-heading font-semibold text-[10px] text-green mb-3 tracking-wider">BACKTEST PERFORMANCE</h4>

      {/* Headline Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <StatBox label="Win Rate" value={f(summary.win_rate_pct)} color={winColor} suffix="%" />
        <StatBox label="Avg Return" value={f(summary.avg_return_pct)} color={returnColor} suffix="%" />
        <StatBox label="Total Signals" value={summary.total_signals || 0} />
        <StatBox label="vs SPY" value={summary.vs_spy_pct != null ? `${summary.vs_spy_pct > 0 ? '+' : ''}${f(summary.vs_spy_pct)}` : '—'} color={spyColor} suffix={summary.vs_spy_pct != null ? '%' : ''} />
      </div>

      {/* Detail Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
        {[
          { l: 'Wins', v: summary.winning_signals },
          { l: 'Avg Hold', v: summary.avg_hold_days != null ? `${summary.avg_hold_days}d` : '—' },
          { l: 'Avg R/R', v: f(summary.avg_reward_risk) },
          { l: 'Best', v: summary.best_return_pct != null ? `${f(summary.best_return_pct)}%` : '—', c: '#00ff88' },
          { l: 'Worst', v: summary.worst_return_pct != null ? `${f(summary.worst_return_pct)}%` : '—', c: '#ff4466' },
          { l: 'Total', v: summary.total_return_pct != null ? `${f(summary.total_return_pct)}%` : '—', c: summary.total_return_pct > 0 ? '#00ff88' : '#ff4466' },
        ].map((m) => (
          <div key={m.l} className="text-center py-1.5">
            <div className="text-[8px] font-mono text-text-dim uppercase">{m.l}</div>
            <div className="text-[11px] font-mono font-medium" style={{ color: m.c || '#fff' }}>{m.v}</div>
          </div>
        ))}
      </div>

      {/* Historical Signals Table */}
      {signals.length > 0 && (
        <>
          <h5 className="font-heading font-semibold text-[9px] text-text-secondary mb-2 tracking-wider">HISTORICAL SIGNALS</h5>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-border">
                  {['Date', 'Wave', 'Entry', 'Stop', 'Target', 'Outcome', 'Return', 'Hold'].map((h) => (
                    <th key={h} className="px-1.5 py-1.5 text-left font-mono text-text-secondary uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displaySignals.map((s, i) => (
                  <motion.tr key={i}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                    className="border-b border-border/20 hover:bg-bg-card-hover">
                    <td className="px-1.5 py-1.5 font-mono text-text-secondary">{s.signal_date || '—'}</td>
                    <td className="px-1.5 py-1.5 font-mono font-medium" style={{ color: s.signal_wave === 'C' ? '#f5a623' : '#00ff88' }}>W{s.signal_wave}</td>
                    <td className="px-1.5 py-1.5 font-mono">${f(s.entry_price, 2)}</td>
                    <td className="px-1.5 py-1.5 font-mono text-red">${f(s.stop_loss, 2)}</td>
                    <td className="px-1.5 py-1.5 font-mono text-green">${f(s.target_1, 2)}</td>
                    <td className="px-1.5 py-1.5">
                      <span className="font-mono text-[9px] px-1.5 py-0.5 border"
                        style={{ color: OUTCOME_COLORS[s.outcome] || '#888', borderColor: OUTCOME_COLORS[s.outcome] || '#444' }}>
                        {s.outcome?.replace(/_/g, ' ') || '—'}
                      </span>
                    </td>
                    <td className="px-1.5 py-1.5 font-mono" style={{ color: s.pct_return > 0 ? '#00ff88' : s.pct_return < 0 ? '#ff4466' : '#888' }}>
                      {s.pct_return != null ? `${s.pct_return > 0 ? '+' : ''}${f(s.pct_return)}%` : '—'}
                    </td>
                    <td className="px-1.5 py-1.5 font-mono text-text-secondary">{s.hold_days != null ? `${s.hold_days}d` : '—'}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          {signals.length > 5 && (
            <button onClick={() => setShowAll(!showAll)}
              className="mt-2 text-[9px] font-mono text-green hover:underline">
              {showAll ? 'Show less' : `Show all ${signals.length} signals`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
