import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import supabase from '../supabaseClient';

export default function PriceChart({ ticker }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticker) return;
    async function fetch() {
      // Get current screener data with MA levels
      const { data: sr } = await supabase
        .from('screener_results')
        .select('current_price, price_200wma, price_200mma, ma_50d, week_52_high, week_52_low, pct_from_200wma, pct_from_200mma')
        .eq('ticker', ticker)
        .single();
      setData(sr);
      setLoading(false);
    }
    fetch();
  }, [ticker]);

  if (loading || !data || !data.current_price) return null;

  const price = data.current_price;
  const wma = data.price_200wma;
  const mma = data.price_200mma;
  const ma50 = data.ma_50d;
  const high52 = data.week_52_high;
  const low52 = data.week_52_low;

  // Build price levels for the ladder view
  const levels = [
    high52 && { label: '52W High', value: high52, color: 'var(--text-dim)' },
    ma50 && { label: '50 DMA', value: ma50, color: '#8b5cf6' },
    wma && { label: '200 WMA', value: wma, color: '#f59e0b' },
    mma && { label: '200 MMA', value: mma, color: '#ef4444' },
    low52 && { label: '52W Low', value: low52, color: 'var(--text-dim)' },
  ].filter(Boolean).sort((a, b) => b.value - a.value);

  if (levels.length === 0) return null;

  const allValues = [...levels.map(l => l.value), price];
  const min = Math.min(...allValues) * 0.95;
  const max = Math.max(...allValues) * 1.05;
  const range = max - min || 1;

  const W = 400;
  const H = 180;
  const PAD = { left: 80, right: 60, top: 16, bottom: 16 };
  const plotH = H - PAD.top - PAD.bottom;

  const yPos = (val) => PAD.top + plotH - ((val - min) / range) * plotH;
  const priceY = yPos(price);

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
        Price vs Moving Averages
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {/* MA reference lines */}
        {levels.map((level, i) => {
          const y = yPos(level.value);
          return (
            <g key={i}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                stroke={level.color} strokeWidth={1} strokeDasharray="4,4" opacity={0.6} />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end"
                fill={level.color} fontSize="9" fontFamily="IBM Plex Mono">
                {level.label}
              </text>
              <text x={W - PAD.right + 6} y={y + 3} textAnchor="start"
                fill={level.color} fontSize="9" fontFamily="IBM Plex Mono">
                ${level.value.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* Current price line (solid, prominent) */}
        <line x1={PAD.left} y1={priceY} x2={W - PAD.right} y2={priceY}
          stroke="#10b981" strokeWidth={2} />
        <text x={PAD.left - 6} y={priceY + 3} textAnchor="end"
          fill="#10b981" fontSize="10" fontWeight="600" fontFamily="IBM Plex Mono">
          Price
        </text>
        <text x={W - PAD.right + 6} y={priceY + 3} textAnchor="start"
          fill="#10b981" fontSize="10" fontWeight="600" fontFamily="IBM Plex Mono">
          ${price.toFixed(2)}
        </text>

        {/* Price marker */}
        <circle cx={(PAD.left + W - PAD.right) / 2} cy={priceY} r={5}
          fill="#10b981" stroke="var(--bg-card)" strokeWidth={2} />

        {/* Zone shading between 200WMA and 200MMA */}
        {wma && mma && (
          <rect
            x={PAD.left} y={Math.min(yPos(wma), yPos(mma))}
            width={W - PAD.left - PAD.right}
            height={Math.abs(yPos(wma) - yPos(mma))}
            fill="#f59e0b" opacity={0.06} rx={2}
          />
        )}
      </svg>

      {/* Distance metrics */}
      <div style={{
        display: 'flex', gap: '16px', marginTop: '8px',
        fontFamily: 'IBM Plex Mono', fontSize: '10px',
      }}>
        {data.pct_from_200wma != null && (
          <span style={{ color: data.pct_from_200wma <= 0 ? '#10b981' : '#f59e0b' }}>
            200WMA: {data.pct_from_200wma > 0 ? '+' : ''}{data.pct_from_200wma.toFixed(1)}%
          </span>
        )}
        {data.pct_from_200mma != null && (
          <span style={{ color: data.pct_from_200mma <= 0 ? '#10b981' : '#ef4444' }}>
            200MMA: {data.pct_from_200mma > 0 ? '+' : ''}{data.pct_from_200mma.toFixed(1)}%
          </span>
        )}
      </div>
    </motion.div>
  );
}
