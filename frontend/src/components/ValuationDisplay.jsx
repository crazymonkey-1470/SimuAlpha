import { useValuation } from '../hooks/useValuation';

export default function ValuationDisplay({ ticker, currentPrice }) {
  const { data: val, loading } = useValuation(ticker);

  if (loading) return null;
  if (!val) return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '20px',
      fontFamily: 'IBM Plex Mono',
      fontSize: '11px',
      color: 'var(--text-dim)',
    }}>
      No valuation data available for {ticker}
    </div>
  );

  const price = currentPrice || val.current_price;
  const ratingColors = {
    BUY: '#00e87a',
    OVERWEIGHT: '#f0a500',
    HOLD: 'var(--text-secondary)',
    NEUTRAL: 'var(--text-dim)',
  };

  const methods = [
    {
      label: `DCF (${val.dcf_wacc || '—'}%)`,
      target: val.dcf_price_target,
      upside: val.dcf_upside_pct,
    },
    {
      label: 'EV/Sales',
      target: val.ev_sales_price_target,
      upside: val.ev_sales_upside_pct,
    },
    {
      label: 'EV/EBITDA',
      target: val.ev_ebitda_price_target,
      upside: val.ev_ebitda_upside_pct,
    },
  ];

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '20px',
      fontFamily: 'IBM Plex Mono',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
      }}>
        <div>
          <span style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '0.05em',
          }}>
            {ticker} VALUATION
          </span>
          <span style={{
            fontSize: '10px',
            color: 'var(--text-dim)',
            marginLeft: '8px',
          }}>
            TLI Three-Pillar
          </span>
        </div>
        <div style={{
          fontSize: '12px',
          fontWeight: 600,
          color: ratingColors[val.tli_rating] || 'var(--text-secondary)',
          padding: '4px 10px',
          borderRadius: '4px',
          border: `1px solid ${(ratingColors[val.tli_rating] || 'var(--text-dim)')}30`,
        }}>
          {val.tli_rating || '—'}
        </div>
      </div>

      {price && (
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          Current: <strong style={{ color: 'var(--text-primary)' }}>${Number(price).toFixed(2)}</strong>
        </div>
      )}

      {/* Methods Table */}
      <div style={{
        borderTop: '1px solid var(--border)',
        paddingTop: '12px',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 80px 70px 1fr',
          gap: '4px 8px',
          fontSize: '10px',
          color: 'var(--text-dim)',
          marginBottom: '8px',
          letterSpacing: '0.05em',
        }}>
          <span>METHOD</span>
          <span style={{ textAlign: 'right' }}>TARGET</span>
          <span style={{ textAlign: 'right' }}>UPSIDE</span>
          <span></span>
        </div>

        {methods.map((m) => (
          <div
            key={m.label}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 80px 70px 1fr',
              gap: '4px 8px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              padding: '6px 0',
              borderTop: '1px solid var(--border)',
            }}
          >
            <span>{m.label}</span>
            <span style={{ textAlign: 'right', color: 'var(--text-primary)', fontWeight: 500 }}>
              {m.target != null ? `$${Math.round(m.target)}` : '—'}
            </span>
            <span style={{
              textAlign: 'right',
              fontWeight: 500,
              color: m.upside > 15 ? '#00e87a'
                : m.upside > 5 ? '#f0a500'
                : m.upside != null && m.upside < 0 ? '#e84444'
                : 'var(--text-secondary)',
            }}>
              {m.upside != null ? `${m.upside > 0 ? '+' : ''}${Math.round(m.upside)}%` : '—'}
            </span>
            <UpsideBar upside={m.upside} />
          </div>
        ))}
      </div>

      {/* Average */}
      <div style={{
        borderTop: '1px solid var(--border)',
        paddingTop: '10px',
        marginTop: '4px',
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '12px',
      }}>
        <span style={{ color: 'var(--text-secondary)' }}>
          Average PT: <strong style={{ color: 'var(--text-primary)' }}>
            ${val.avg_price_target != null ? Math.round(val.avg_price_target) : '—'}
          </strong>
        </span>
        <span style={{
          color: val.avg_upside_pct > 15 ? '#00e87a'
            : val.avg_upside_pct > 5 ? '#f0a500'
            : val.avg_upside_pct != null && val.avg_upside_pct < 0 ? '#e84444'
            : 'var(--text-secondary)',
          fontWeight: 600,
        }}>
          {val.avg_upside_pct != null ? `${val.avg_upside_pct > 0 ? '+' : ''}${Math.round(val.avg_upside_pct)}%` : '—'}
        </span>
      </div>

      {/* WACC */}
      {val.wacc_risk_tier && (
        <div style={{
          borderTop: '1px solid var(--border)',
          paddingTop: '8px',
          marginTop: '8px',
          fontSize: '10px',
          color: 'var(--text-dim)',
        }}>
          WACC: {val.dcf_wacc}% ({val.wacc_risk_tier})
          {val.dcf_growth_rate != null && (
            <span> | Growth: {val.dcf_growth_rate}%</span>
          )}
          {val.dcf_terminal_rate != null && (
            <span> | Terminal: {val.dcf_terminal_rate}%</span>
          )}
        </div>
      )}
    </div>
  );
}

function UpsideBar({ upside }) {
  if (upside == null) return <span />;

  const clamped = Math.max(-30, Math.min(50, upside));
  const widthPct = Math.abs(clamped) * 2;
  const color = upside > 15 ? '#00e87a'
    : upside > 5 ? '#f0a500'
    : upside < 0 ? '#e84444'
    : 'var(--text-dim)';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      height: '12px',
    }}>
      <div style={{
        height: '6px',
        width: `${widthPct}%`,
        maxWidth: '100%',
        background: color,
        borderRadius: '3px',
        opacity: 0.7,
      }} />
    </div>
  );
}
