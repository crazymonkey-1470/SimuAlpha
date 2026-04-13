import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import supabase from '../supabaseClient';

export default function ScoreHistoryChart({ ticker }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticker) return;
    async function fetch() {
      // Try score_history table first, fallback to signal_history
      const { data } = await supabase
        .from('signal_history')
        .select('ticker, signal, score, fired_at')
        .eq('ticker', ticker)
        .order('fired_at', { ascending: true })
        .limit(30);
      setHistory(data || []);
      setLoading(false);
    }
    fetch();
  }, [ticker]);

  if (loading || history.length < 2) return null;

  const W = 400;
  const H = 140;
  const PAD = { top: 16, right: 16, bottom: 28, left: 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const scores = history.map(h => h.score ?? 0);
  const minScore = Math.min(...scores, 0);
  const maxScore = Math.max(...scores, 100);
  const range = maxScore - minScore || 1;

  const points = history.map((h, i) => {
    const x = PAD.left + (i / (history.length - 1)) * plotW;
    const y = PAD.top + plotH - ((h.score - minScore) / range) * plotH;
    return { x, y, score: h.score, date: h.fired_at, signal: h.signal };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = linePath + ` L${points[points.length - 1].x},${PAD.top + plotH} L${points[0].x},${PAD.top + plotH} Z`;

  const gridLines = [0, 25, 50, 75, 100].filter(v => v >= minScore && v <= maxScore);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '16px',
      }}
    >
      <div style={{
        fontFamily: 'Cormorant Garamond', fontSize: '16px',
        fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px',
      }}>
        Score History
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {/* Grid lines */}
        {gridLines.map(v => {
          const y = PAD.top + plotH - ((v - minScore) / range) * plotH;
          return (
            <g key={v}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                stroke="var(--border)" strokeWidth={0.5} strokeDasharray="3,3" />
              <text x={PAD.left - 4} y={y + 3} textAnchor="end"
                fill="var(--text-dim)" fontSize="9" fontFamily="IBM Plex Mono">
                {v}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill="url(#scoreGrad)" opacity={0.15} />

        {/* Line */}
        <motion.path
          d={linePath}
          fill="none" stroke="#10b981" strokeWidth={2}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />

        {/* Data points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3}
            fill={p.score >= 70 ? '#10b981' : p.score >= 50 ? '#f59e0b' : '#ef4444'}
            stroke="var(--bg-card)" strokeWidth={1.5}
          />
        ))}

        {/* X-axis date labels */}
        {[points[0], points[Math.floor(points.length / 2)], points[points.length - 1]].map((p, i) => (
          <text key={i} x={p.x} y={H - 4} textAnchor="middle"
            fill="var(--text-dim)" fontSize="8" fontFamily="IBM Plex Mono">
            {new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </text>
        ))}

        <defs>
          <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
      </svg>

      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)',
        marginTop: '4px',
      }}>
        <span>{history.length} data points</span>
        <span>Latest: {scores[scores.length - 1]}</span>
      </div>
    </motion.div>
  );
}
