import { motion } from 'framer-motion';
import { useMacroContext } from '../hooks/useMacro';

const RISK_COLORS = {
  GREEN: { bg: 'rgba(0,232,122,0.08)', border: 'rgba(0,232,122,0.25)', text: '#00e87a', label: 'GREEN' },
  YELLOW: { bg: 'rgba(240,165,0,0.08)', border: 'rgba(240,165,0,0.25)', text: '#f0a500', label: 'YELLOW' },
  ORANGE: { bg: 'rgba(255,140,0,0.08)', border: 'rgba(255,140,0,0.25)', text: '#ff8c00', label: 'ORANGE' },
  RED: { bg: 'rgba(232,68,68,0.08)', border: 'rgba(232,68,68,0.25)', text: '#e84444', label: 'RED' },
};

const RISK_LABELS = {
  GREEN: 'Risk Off',
  YELLOW: 'Late Cycle',
  ORANGE: 'Elevated Risk',
  RED: 'High Risk',
};

export default function MarketRiskBanner() {
  const { data: ctx, loading } = useMacroContext();

  if (loading || !ctx) return null;

  const risk = RISK_COLORS[ctx.market_risk_level] || RISK_COLORS.YELLOW;
  const label = RISK_LABELS[ctx.market_risk_level] || 'Unknown';

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: risk.bg,
        border: `1px solid ${risk.border}`,
        borderRadius: '8px',
        padding: '16px 20px',
        marginBottom: '24px',
        fontFamily: 'IBM Plex Mono',
        fontSize: '11px',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '10px',
        flexWrap: 'wrap',
      }}>
        <span style={{
          color: risk.text,
          fontWeight: 700,
          fontSize: '12px',
          letterSpacing: '0.08em',
        }}>
          MARKET CONTEXT: {risk.label} — {label}
        </span>
        <span style={{
          color: 'var(--text-dim)',
          fontSize: '10px',
        }}>
          Score: {ctx.late_cycle_score}/14
        </span>
      </div>

      <div style={{
        display: 'flex',
        gap: '16px',
        flexWrap: 'wrap',
        color: 'var(--text-secondary)',
        lineHeight: 1.8,
      }}>
        {ctx.sp500_pe != null && (
          <span>S&P P/E: <strong style={{ color: 'var(--text-primary)' }}>{ctx.sp500_pe}x</strong> (vs 17x avg)</span>
        )}
        {ctx.dxy_index != null && (
          <span>DXY: <strong style={{ color: 'var(--text-primary)' }}>{ctx.dxy_index}</strong></span>
        )}
        {ctx.jpy_usd != null && (
          <span>
            JPY: <strong style={{ color: 'var(--text-primary)' }}>{ctx.jpy_usd}</strong>
            {ctx.jpy_near_intervention && <span style={{ color: '#f0a500' }}> &#9888;&#65039;</span>}
          </span>
        )}
        {ctx.vix != null && (
          <span>VIX: <strong style={{ color: 'var(--text-primary)' }}>{ctx.vix}</strong></span>
        )}
      </div>

      <div style={{
        display: 'flex',
        gap: '16px',
        flexWrap: 'wrap',
        color: 'var(--text-secondary)',
        lineHeight: 1.8,
        marginTop: '4px',
      }}>
        {ctx.carry_trade_risk && (
          <span>
            Carry Risk: <strong style={{
              color: ctx.carry_trade_risk === 'HIGH' ? '#e84444'
                : ctx.carry_trade_risk === 'MODERATE' ? '#f0a500' : '#00e87a'
            }}>{ctx.carry_trade_risk}</strong>
          </span>
        )}
        {ctx.investors_defensive_count != null && (
          <span>
            <strong style={{ color: 'var(--text-primary)' }}>{ctx.investors_defensive_count}/8</strong> Investors Defensive
          </span>
        )}
        {ctx.fed_rate != null && (
          <span>Fed: <strong style={{ color: 'var(--text-primary)' }}>{ctx.fed_rate}%</strong></span>
        )}
        {ctx.boj_rate != null && (
          <span>BOJ: <strong style={{ color: 'var(--text-primary)' }}>{ctx.boj_rate}%</strong></span>
        )}
        {ctx.carry_spread != null && (
          <span>Spread: <strong style={{ color: 'var(--text-primary)' }}>{ctx.carry_spread}%</strong></span>
        )}
        {ctx.iran_war_active && (
          <span style={{ color: '#e84444' }}>Iran War: Active</span>
        )}
      </div>
    </motion.div>
  );
}
