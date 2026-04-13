import { motion } from 'framer-motion';
import MarketRiskBanner from '../components/MarketRiskBanner';
import CarryTradeMonitor from '../components/CarryTradeMonitor';
import { useMacroContext, useMacroHistory } from '../hooks/useMacro';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

export default function MarketContext() {
  const { data: ctx, loading } = useMacroContext();
  const { data: history, loading: historyLoading } = useMacroHistory(10);

  return (
    <div style={{ paddingTop: '48px' }}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: '32px' }}
      >
        <h1 style={{
          fontFamily: 'Cormorant Garamond',
          fontSize: 'clamp(36px, 6vw, 64px)',
          fontWeight: 300,
          color: 'var(--text-primary)',
          lineHeight: 0.9,
          marginBottom: '16px',
        }}>
          Market<br />
          <span style={{ color: 'var(--signal-amber)', fontStyle: 'italic' }}>Context</span>
        </h1>
        <p style={{
          fontFamily: 'IBM Plex Mono',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          maxWidth: '500px',
          lineHeight: 1.7,
        }}>
          Global macro conditions that influence the TLI scoring engine.
          Market risk level adjusts penalties for late-cycle positioning.
        </p>
      </motion.div>

      <MarketRiskBanner />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '16px',
        marginBottom: '48px',
      }}>
        <CarryTradeMonitor />

        {/* Dollar Strength Panel */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '20px',
            fontFamily: 'IBM Plex Mono',
          }}
        >
          <div style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: '16px',
            letterSpacing: '0.05em',
          }}>
            DOLLAR & LIQUIDITY
          </div>

          {loading ? <LoadingSpinner /> : !ctx ? (
            <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>No data</div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
            }}>
              <MetricRow label="DXY Index" value={ctx.dxy_index} warn={ctx.dxy_index > 105} />
              <MetricRow label="DXY Direction" value={ctx.dxy_direction || '—'} />
              <MetricRow label="EUR/USD Basis" value={ctx.eur_usd_basis != null ? `${ctx.eur_usd_basis}bp` : '—'} warn={ctx.eur_usd_basis < -2} />
              <MetricRow label="VIX" value={ctx.vix} warn={ctx.vix > 25} />
            </div>
          )}
        </motion.div>

        {/* Valuation Panel */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '20px',
            fontFamily: 'IBM Plex Mono',
          }}
        >
          <div style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: '16px',
            letterSpacing: '0.05em',
          }}>
            MARKET VALUATION
          </div>

          {loading ? <LoadingSpinner /> : !ctx ? (
            <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>No data</div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
            }}>
              <MetricRow label="S&P 500 P/E" value={ctx.sp500_pe != null ? `${ctx.sp500_pe}x` : '—'} warn={ctx.sp500_pe > 25} />
              <MetricRow label="vs 140yr Avg (17x)" value={ctx.sp500_pe_vs_140yr_avg != null ? `${ctx.sp500_pe_vs_140yr_avg}x` : '—'} />
              <MetricRow label="Geopolitical Risk" value={ctx.geopolitical_risk_level || '—'} warn={ctx.geopolitical_risk_level === 'HIGH' || ctx.geopolitical_risk_level === 'ELEVATED'} />
              <MetricRow label="Iran War" value={ctx.iran_war_active ? 'Active' : 'Inactive'} warn={ctx.iran_war_active} />
            </div>
          )}
        </motion.div>

        {/* Super Investor Sentiment */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '20px',
            fontFamily: 'IBM Plex Mono',
          }}
        >
          <div style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: '16px',
            letterSpacing: '0.05em',
          }}>
            SUPER INVESTOR SENTIMENT
          </div>

          {loading ? <LoadingSpinner /> : !ctx ? (
            <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>No data</div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
            }}>
              <MetricRow
                label="Defensive Count"
                value={ctx.investors_defensive_count != null ? `${ctx.investors_defensive_count}/8` : '—'}
                warn={ctx.investors_defensive_count >= 5}
              />
              <MetricRow
                label="Berkshire Cash/Equity"
                value={ctx.berkshire_cash_equity_ratio != null ? `${ctx.berkshire_cash_equity_ratio}x` : '—'}
                warn={ctx.berkshire_cash_equity_ratio > 1.0}
              />
              <MetricRow
                label="SPY Puts Count"
                value={ctx.spy_puts_count != null ? `${ctx.spy_puts_count} investors` : '—'}
                warn={ctx.spy_puts_count >= 3}
              />
            </div>
          )}
        </motion.div>
      </div>

      {/* History */}
      {historyLoading && <LoadingSpinner />}
      {!historyLoading && history.length === 0 && (
        <EmptyState message="No historical data" sub="Macro context history will appear once daily snapshots accumulate." />
      )}
      {!historyLoading && history.length > 1 && (
        <div style={{ marginBottom: '48px' }}>
          <h2 style={{
            fontFamily: 'Cormorant Garamond',
            fontSize: '24px',
            fontWeight: 400,
            color: 'var(--text-primary)',
            marginBottom: '16px',
          }}>
            Historical Context
          </h2>

          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '100px 80px 70px 70px 70px 70px',
              gap: '4px',
              padding: '10px 16px',
              fontFamily: 'IBM Plex Mono',
              fontSize: '10px',
              color: 'var(--text-dim)',
              letterSpacing: '0.05em',
              borderBottom: '1px solid var(--border)',
            }}>
              <span>DATE</span>
              <span>RISK</span>
              <span>SCORE</span>
              <span>VIX</span>
              <span>DXY</span>
              <span>JPY</span>
            </div>
            {history.map((h) => {
              const riskColor = {
                GREEN: '#00e87a',
                YELLOW: '#f0a500',
                ORANGE: '#ff8c00',
                RED: '#e84444',
              }[h.market_risk_level] || 'var(--text-dim)';

              return (
                <div
                  key={h.date}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '100px 80px 70px 70px 70px 70px',
                    gap: '4px',
                    padding: '6px 16px',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span style={{ color: 'var(--text-secondary)' }}>{h.date}</span>
                  <span style={{ color: riskColor, fontWeight: 500 }}>{h.market_risk_level}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{h.late_cycle_score}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{h.vix ?? '—'}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{h.dxy_index ?? '—'}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{h.jpy_usd ?? '—'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricRow({ label, value, warn }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span>{label}</span>
      <span style={{
        color: warn ? '#f0a500' : 'var(--text-primary)',
        fontWeight: 500,
      }}>
        {value ?? '—'}
      </span>
    </div>
  );
}
