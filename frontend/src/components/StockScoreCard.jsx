import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import SignalBadge from './SignalBadge';

export default function StockScoreCard({ stock, index = 0 }) {
  const navigate = useNavigate();

  if (!stock) return null;

  const flags = Array.isArray(stock.flags) ? stock.flags : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={() => navigate(`/ticker/${stock.ticker}`)}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '20px',
        cursor: 'pointer',
        transition: 'border-color 0.15s ease',
      }}
      onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--border-light)'}
      onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            fontFamily: 'IBM Plex Mono',
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}>
            {stock.ticker}
          </span>
          <SignalBadge signal={stock.signal} size="sm" />
        </div>
        <span style={{
          fontFamily: 'IBM Plex Mono',
          fontSize: '20px',
          fontWeight: 500,
          color: 'var(--text-primary)',
        }}>
          {stock.total_score}
        </span>
      </div>

      {/* Company Name */}
      <div style={{
        fontFamily: 'IBM Plex Mono',
        fontSize: '10px',
        color: 'var(--text-dim)',
        marginBottom: '12px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {stock.company_name}
      </div>

      {/* Score Breakdown */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '6px 12px',
        fontSize: '11px',
        fontFamily: 'IBM Plex Mono',
        color: 'var(--text-secondary)',
        borderTop: '1px solid var(--border)',
        paddingTop: '10px',
        marginBottom: '10px',
      }}>
        <ScoreRow label="Fundamental" value={`${stock.fundamental_base ?? stock.fundamental_score ?? '—'}/50`} />
        <ScoreRow label="Technical" value={`${stock.technical_base ?? stock.technical_score ?? '—'}/50`} />
        {stock.bonus_points != null && stock.bonus_points > 0 && (
          <ScoreRow label="Bonuses" value={`+${stock.bonus_points}`} color="#00e87a" />
        )}
        {stock.penalty_points != null && stock.penalty_points < 0 && (
          <ScoreRow label="Penalties" value={`${stock.penalty_points}`} color="#e84444" />
        )}
        {stock.earnings_quality_adj != null && stock.earnings_quality_adj !== 0 && (
          <ScoreRow
            label="Earnings Q"
            value={stock.earnings_quality_adj > 0 ? `+${stock.earnings_quality_adj}` : `${stock.earnings_quality_adj}`}
            color={stock.earnings_quality_adj > 0 ? '#00e87a' : '#e84444'}
          />
        )}
        {stock.wave_bonus != null && stock.wave_bonus > 0 && (
          <ScoreRow label="Wave Bonus" value={`+${stock.wave_bonus}`} color="#4a9eff" />
        )}
      </div>

      {/* Fundamentals Summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '4px 12px',
        fontSize: '10px',
        fontFamily: 'IBM Plex Mono',
        color: 'var(--text-dim)',
        borderTop: '1px solid var(--border)',
        paddingTop: '8px',
        marginBottom: '8px',
      }}>
        {stock.revenue_growth_3yr != null && (
          <span>Rev Growth (3yr): <strong style={{ color: 'var(--text-secondary)' }}>{stock.revenue_growth_3yr > 0 ? '+' : ''}{Math.round(stock.revenue_growth_3yr)}%</strong></span>
        )}
        {stock.fcf_margin != null && (
          <span>FCF Margin: <strong style={{ color: 'var(--text-secondary)' }}>{Math.round(stock.fcf_margin)}%</strong></span>
        )}
        {stock.dividend_yield != null && stock.dividend_yield > 0 && (
          <span>Div: <strong style={{ color: 'var(--text-secondary)' }}>{stock.dividend_yield}%</strong></span>
        )}
        {stock.institutional_holders != null && stock.institutional_holders > 0 && (
          <span>Investors: <strong style={{ color: 'var(--text-secondary)' }}>{stock.institutional_holders}/8</strong></span>
        )}
      </div>

      {/* Valuation */}
      {stock.valuation_rating && (
        <div style={{
          borderTop: '1px solid var(--border)',
          paddingTop: '8px',
          marginBottom: '8px',
          fontSize: '10px',
          fontFamily: 'IBM Plex Mono',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <ValuationBadge rating={stock.valuation_rating} />
          {stock.avg_price_target != null && (
            <span style={{ color: 'var(--text-secondary)' }}>
              PT: ${Math.round(stock.avg_price_target)}
            </span>
          )}
          {stock.avg_upside_pct != null && (
            <span style={{ color: stock.avg_upside_pct > 0 ? '#00e87a' : '#e84444' }}>
              {stock.avg_upside_pct > 0 ? '+' : ''}{Math.round(stock.avg_upside_pct)}%
            </span>
          )}
        </div>
      )}

      {/* Flags */}
      {flags.length > 0 && (
        <div style={{
          borderTop: '1px solid var(--border)',
          paddingTop: '8px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
        }}>
          {flags.slice(0, 4).map((flag) => (
            <span
              key={flag}
              style={{
                fontSize: '9px',
                fontFamily: 'IBM Plex Mono',
                padding: '2px 6px',
                borderRadius: '3px',
                background: 'var(--bg-secondary)',
                color: 'var(--text-dim)',
                border: '1px solid var(--border)',
              }}
            >
              {flag}
            </span>
          ))}
          {flags.length > 4 && (
            <span style={{ fontSize: '9px', color: 'var(--text-dim)', fontFamily: 'IBM Plex Mono' }}>
              +{flags.length - 4} more
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}

function ScoreRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span>{label}</span>
      <span style={{ color: color || 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function ValuationBadge({ rating }) {
  const colors = {
    BUY: { color: '#00e87a', bg: 'rgba(0,232,122,0.1)' },
    UNDERVALUED: { color: '#00e87a', bg: 'rgba(0,232,122,0.1)' },
    OVERWEIGHT: { color: '#f0a500', bg: 'rgba(240,165,0,0.1)' },
    HOLD: { color: 'var(--text-secondary)', bg: 'transparent' },
    NEUTRAL: { color: 'var(--text-dim)', bg: 'transparent' },
  };
  const displayMap = { BUY: 'Undervalued', OVERWEIGHT: 'Favorable', HOLD: 'Fair Value', NEUTRAL: 'Neutral' };
  const c = colors[rating] || colors.NEUTRAL;

  return (
    <span style={{
      fontSize: '9px',
      fontWeight: 600,
      padding: '2px 6px',
      borderRadius: '3px',
      color: c.color,
      background: c.bg,
      border: `1px solid ${c.color}30`,
      letterSpacing: '0.05em',
    }}>
      {displayMap[rating] || rating}
    </span>
  );
}
