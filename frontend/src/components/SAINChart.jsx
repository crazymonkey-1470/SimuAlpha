import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import supabase from '../supabaseClient';

export default function SAINChart({ ticker }) {
  const [consensus, setConsensus] = useState(null);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticker) return;
    async function fetch() {
      const [{ data: con }, { data: sigs }] = await Promise.all([
        supabase.from('sain_consensus').select('*')
          .eq('ticker', ticker)
          .order('computed_date', { ascending: false }).limit(1),
        supabase.from('sain_signals').select('direction, conviction, signal_date, ai_model_name, politician_name, quality_score')
          .eq('ticker', ticker)
          .order('signal_date', { ascending: false }).limit(15),
      ]);
      setConsensus(con?.[0] || null);
      setSignals(sigs || []);
      setLoading(false);
    }
    fetch();
  }, [ticker]);

  if (loading) return null;
  if (!consensus && signals.length === 0) return null;

  const layers = consensus ? [
    { label: 'Super Investors', score: consensus.super_investor_score || 0, color: '#f59e0b' },
    { label: 'Politicians', score: consensus.politician_score || 0, color: '#8b5cf6' },
    { label: 'AI Models', score: consensus.ai_model_score || 0, color: '#3b82f6' },
    { label: 'TLI Score', score: consensus.tli_score || 0, color: '#10b981' },
  ] : [];

  const totalScore = consensus?.total_sain_score || 0;
  const isFSC = consensus?.is_full_stack_consensus;
  const maxLayerScore = Math.max(...layers.map(l => Math.abs(l.score)), 10);

  const W = 400;
  const barH = 24;
  const GAP = 8;
  const layerH = layers.length * (barH + GAP);
  const signalH = signals.length > 0 ? Math.min(signals.length, 8) * 22 + 32 : 0;
  const H = 40 + layerH + signalH;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${isFSC ? 'rgba(16, 185, 129, 0.3)' : 'var(--border)'}`,
        borderRadius: '12px',
        padding: '16px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{
          fontFamily: 'Cormorant Garamond', fontSize: '16px',
          fontWeight: 500, color: 'var(--text-primary)',
        }}>
          SAIN Consensus
          {isFSC && <span style={{ color: '#10b981', marginLeft: '8px', fontSize: '12px' }}>FULL STACK</span>}
        </div>
        {totalScore !== 0 && (
          <span style={{
            fontFamily: 'IBM Plex Mono', fontSize: '14px', fontWeight: 600,
            color: totalScore > 0 ? '#10b981' : totalScore < 0 ? '#ef4444' : 'var(--text-dim)',
          }}>
            {totalScore > 0 ? '+' : ''}{totalScore}
          </span>
        )}
      </div>

      {/* Layer bars */}
      {layers.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          {layers.map((layer, i) => {
            const pct = Math.min(Math.abs(layer.score) / maxLayerScore * 100, 100);
            const isPositive = layer.score >= 0;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: GAP + 'px' }}>
                <div style={{
                  fontFamily: 'IBM Plex Mono', fontSize: '9px',
                  color: 'var(--text-secondary)', width: '90px', textAlign: 'right', flexShrink: 0,
                }}>
                  {layer.label}
                </div>
                <div style={{
                  flex: 1, height: barH + 'px', background: 'var(--bg-secondary)',
                  borderRadius: '4px', overflow: 'hidden', position: 'relative',
                }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: pct + '%' }}
                    transition={{ duration: 0.6, delay: i * 0.1 }}
                    style={{
                      height: '100%', borderRadius: '4px',
                      background: isPositive ? layer.color : '#ef4444',
                      opacity: 0.8,
                    }}
                  />
                </div>
                <div style={{
                  fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 500,
                  color: isPositive ? layer.color : '#ef4444', width: '32px', textAlign: 'right',
                }}>
                  {layer.score > 0 ? '+' : ''}{layer.score}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent signals feed */}
      {signals.length > 0 && (
        <div>
          <div style={{
            fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-dim)',
            textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px',
          }}>
            Recent Signals
          </div>
          {signals.slice(0, 8).map((sig, i) => {
            const isBuy = sig.direction === 'BUY' || sig.direction === 'BULLISH';
            const source = sig.ai_model_name || sig.politician_name || 'Unknown';
            return (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '4px 0',
                borderBottom: i < Math.min(signals.length, 8) - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px' }}>
                  <span style={{ color: isBuy ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                    {sig.direction}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', marginLeft: '6px' }}>
                    {source.substring(0, 20)}
                  </span>
                </div>
                <span style={{
                  fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-dim)',
                }}>
                  {sig.signal_date ? new Date(sig.signal_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
