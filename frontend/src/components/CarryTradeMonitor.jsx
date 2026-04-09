import { useMacroContext } from '../hooks/useMacro';

const STATUS_COLORS = {
  HIGH: { color: '#e84444', bg: 'rgba(232,68,68,0.08)', border: 'rgba(232,68,68,0.2)' },
  MODERATE: { color: '#f0a500', bg: 'rgba(240,165,0,0.08)', border: 'rgba(240,165,0,0.2)' },
  LOW: { color: '#00e87a', bg: 'rgba(0,232,122,0.08)', border: 'rgba(0,232,122,0.2)' },
};

export default function CarryTradeMonitor() {
  const { data: ctx, loading } = useMacroContext();

  if (loading || !ctx) return null;

  const risk = ctx.carry_trade_risk || 'LOW';
  const style = STATUS_COLORS[risk] || STATUS_COLORS.LOW;

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${style.border}`,
      borderRadius: '12px',
      padding: '20px',
      fontFamily: 'IBM Plex Mono',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '16px',
      }}>
        <span style={{ fontSize: '16px' }}>&#127471;&#127477;</span>
        <span style={{
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          letterSpacing: '0.05em',
        }}>
          CARRY TRADE MONITOR
        </span>
      </div>

      <div style={{
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: '4px',
        background: style.bg,
        color: style.color,
        fontSize: '11px',
        fontWeight: 600,
        marginBottom: '16px',
        border: `1px solid ${style.border}`,
      }}>
        Status: {risk}
      </div>

      <div style={{
        borderTop: '1px solid var(--border)',
        paddingTop: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        fontSize: '11px',
        color: 'var(--text-secondary)',
      }}>
        <Row label="BOJ Rate" value={ctx.boj_rate != null ? `${ctx.boj_rate}%` : '—'} />
        <Row label="Fed Rate" value={ctx.fed_rate != null ? `${ctx.fed_rate}%` : '—'} />
        <Row
          label="Spread"
          value={ctx.carry_spread != null ? `${ctx.carry_spread}%` : '—'}
          note={ctx.carry_spread != null && ctx.carry_spread < 2.5 ? '(narrowing)' : null}
        />
        <Row
          label="JPY/USD"
          value={ctx.jpy_usd != null ? ctx.jpy_usd : '—'}
          warn={ctx.jpy_near_intervention}
          note={ctx.jpy_near_intervention ? 'near intervention' : null}
        />
      </div>

      <div style={{
        borderTop: '1px solid var(--border)',
        marginTop: '12px',
        paddingTop: '12px',
        fontSize: '10px',
        color: 'var(--text-dim)',
        lineHeight: 1.7,
      }}>
        <div>$20T estimated carry trade exposure</div>
        <div>Last unwind: Aug 2024 (S&P -8%, NASDAQ -10%)</div>
        {risk === 'HIGH' && (
          <div style={{ color: '#f0a500', marginTop: '6px' }}>
            If HIGH: favor low-debt, monopoly, pricing-power stocks
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, warn, note }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span>{label}</span>
      <span style={{ color: warn ? '#f0a500' : 'var(--text-primary)', fontWeight: 500 }}>
        {value}
        {warn && <span> &#9888;&#65039;</span>}
        {note && <span style={{ color: 'var(--text-dim)', fontSize: '10px', marginLeft: '4px' }}>{note}</span>}
      </span>
    </div>
  );
}
