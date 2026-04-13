import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import supabase from '../supabaseClient';

const SIGNAL_ORDER = ['LOAD THE BOAT', 'ACCUMULATE', 'WATCH', 'HOLD', 'CAUTION', 'TRIM', 'AVOID'];
const SIGNAL_COLORS = {
  'LOAD THE BOAT': '#10b981',
  'ACCUMULATE': '#3b82f6',
  'WATCH': '#f59e0b',
  'HOLD': '#8b5cf6',
  'CAUTION': '#f97316',
  'TRIM': '#ef4444',
  'AVOID': '#6b7280',
};

export default function ScoreDistribution() {
  const [distribution, setDistribution] = useState([]);
  const [sectorAvgs, setSectorAvgs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const { data: all } = await supabase
        .from('screener_results')
        .select('signal, sector, total_score');

      if (!all) { setLoading(false); return; }

      // Signal distribution
      const signalCounts = {};
      for (const s of all) {
        const sig = s.signal || 'UNKNOWN';
        signalCounts[sig] = (signalCounts[sig] || 0) + 1;
      }
      const dist = SIGNAL_ORDER
        .filter(s => signalCounts[s])
        .map(s => ({ signal: s, count: signalCounts[s], color: SIGNAL_COLORS[s] || '#6b7280' }));
      setDistribution(dist);

      // Sector averages
      const sectorData = {};
      for (const s of all) {
        if (!s.sector || s.total_score == null) continue;
        if (!sectorData[s.sector]) sectorData[s.sector] = { total: 0, count: 0 };
        sectorData[s.sector].total += s.total_score;
        sectorData[s.sector].count++;
      }
      const avgs = Object.entries(sectorData)
        .map(([sector, d]) => ({ sector, avg: Math.round(d.total / d.count), count: d.count }))
        .sort((a, b) => b.avg - a.avg);
      setSectorAvgs(avgs);

      setLoading(false);
    }
    fetchData();
  }, []);

  if (loading || distribution.length === 0) return null;

  const maxCount = Math.max(...distribution.map(d => d.count));
  const maxAvg = Math.max(...sectorAvgs.map(s => s.avg), 1);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
      {/* Signal Distribution */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}
      >
        <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '20px', fontWeight: 400, color: 'var(--text-primary)', marginBottom: '16px' }}>
          Signal Distribution
        </div>
        {distribution.map(d => (
          <div key={d.signal} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', width: '110px', textAlign: 'right', flexShrink: 0 }}>
              {d.signal}
            </div>
            <div style={{ flex: 1, height: '16px', background: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(d.count / maxCount) * 100}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                style={{ height: '100%', background: d.color, borderRadius: '4px' }}
              />
            </div>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: d.color, width: '32px', textAlign: 'right', fontWeight: 500 }}>
              {d.count}
            </div>
          </div>
        ))}
      </motion.div>

      {/* Sector Heatmap */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}
      >
        <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '20px', fontWeight: 400, color: 'var(--text-primary)', marginBottom: '16px' }}>
          Sector Average Score
        </div>
        {sectorAvgs.map(s => {
          const barColor = s.avg >= 70 ? '#10b981' : s.avg >= 50 ? '#f59e0b' : '#ef4444';
          return (
            <div key={s.sector} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', width: '130px', textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.sector}
              </div>
              <div style={{ flex: 1, height: '16px', background: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(s.avg / maxAvg) * 100}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  style={{ height: '100%', background: barColor, borderRadius: '4px', opacity: 0.8 }}
                />
              </div>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: barColor, width: '32px', textAlign: 'right', fontWeight: 500 }}>
                {s.avg}
              </div>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}
