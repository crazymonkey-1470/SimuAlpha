import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import ScoreRing from './ScoreRing';
import SignalBadge from './SignalBadge';

export default function OpportunityCard({ stock, index }) {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      onClick={() => navigate(`/ticker/${stock.ticker}`)}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '24px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        position: 'relative',
        overflow: 'hidden'
      }}
      whileHover={{
        borderColor: 'var(--border-light)',
        background: 'var(--bg-card-hover)'
      }}
    >
      {stock.signal === 'LOAD THE BOAT' && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: '2px',
          background: 'linear-gradient(90deg, var(--signal-green), transparent)'
        }} />
      )}

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '20px'
      }}>
        <div>
          <div style={{
            fontFamily: 'Cormorant Garamond',
            fontSize: '28px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            lineHeight: 1
          }}>
            {stock.ticker}
          </div>
          <div style={{
            fontFamily: 'IBM Plex Mono',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            marginTop: '4px'
          }}>
            {stock.company_name}
          </div>
        </div>
        <ScoreRing score={stock.total_score} size={64} />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <SignalBadge signal={stock.signal} />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px'
      }}>
        <div>
          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
            FROM 200WMA
          </div>
          <div style={{
            fontFamily: 'IBM Plex Mono',
            fontSize: '14px',
            color: stock.pct_from_200wma <= 0 ? 'var(--signal-green)' : 'var(--text-primary)'
          }}>
            {stock.pct_from_200wma != null ? `${stock.pct_from_200wma.toFixed(1)}%` : '\u2014'}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
            REV GROWTH
          </div>
          <div style={{
            fontFamily: 'IBM Plex Mono',
            fontSize: '14px',
            color: stock.revenue_growth_pct > 0 ? 'var(--signal-green)' : 'var(--red)'
          }}>
            {stock.revenue_growth_pct != null ? `${stock.revenue_growth_pct > 0 ? '+' : ''}${stock.revenue_growth_pct.toFixed(1)}%` : '\u2014'}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
            PRICE
          </div>
          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '14px', color: 'var(--text-primary)' }}>
            {stock.current_price != null ? `$${stock.current_price.toFixed(2)}` : '\u2014'}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
            FROM 52W HIGH
          </div>
          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '14px', color: 'var(--text-primary)' }}>
            {stock.pct_from_52w_high != null ? `${stock.pct_from_52w_high.toFixed(1)}%` : '\u2014'}
          </div>
        </div>
      </div>

      {stock.entry_zone && (
        <div style={{
          marginTop: '16px',
          padding: '8px 12px',
          background: 'var(--signal-green-dim)',
          border: '1px solid var(--signal-green)30',
          borderRadius: '6px',
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px',
          color: 'var(--signal-green)'
        }}>
          Entry zone active
        </div>
      )}
    </motion.div>
  );
}
