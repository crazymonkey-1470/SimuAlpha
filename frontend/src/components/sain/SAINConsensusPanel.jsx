import { motion } from 'framer-motion';
import { useTickerConsensus, useTickerSignals } from '../../hooks/useSAIN';

const LAYERS = [
  { key: 'super_investor_score', label: 'SUPER INVESTORS', icon: '\u{1F3DB}\uFE0F', sublabel: 'Layer 1' },
  { key: 'politician_score', label: 'POLITICIANS', icon: '\u{1F3DB}', sublabel: 'Layer 2' },
  { key: 'ai_model_score', label: 'AI MODELS', icon: '\u{1F916}', sublabel: 'Layer 3' },
  { key: 'tli_score', label: 'TLI ENGINE', icon: '\u{1F4CA}', sublabel: 'Layer 4' },
];

function getScoreColor(score) {
  if (score > 0) return { bg: 'rgba(0,232,122,0.06)', border: 'rgba(0,232,122,0.2)', text: 'var(--signal-green)' };
  if (score < 0) return { bg: 'rgba(232,68,68,0.06)', border: 'rgba(232,68,68,0.2)', text: 'var(--red)' };
  return { bg: 'var(--bg-secondary)', border: 'var(--border)', text: 'var(--text-dim)' };
}

function getDirBadge(direction) {
  if (!direction) return { label: 'N/A', color: 'var(--text-dim)' };
  const displayMap = {
    'STRONG_BUY': 'Maximum Conviction Entry',
    'BUY': 'Approaching Support',
    'MIXED': 'Mixed Signals',
    'SELL': 'Consider Reducing',
    'STRONG_SELL': 'Consider Exiting',
  };
  const label = displayMap[direction] || direction;
  if (direction.includes('BUY')) return { label, color: 'var(--signal-green)' };
  if (direction.includes('SELL')) return { label, color: 'var(--red)' };
  return { label, color: 'var(--signal-amber)' };
}

export default function SAINConsensusPanel({ ticker }) {
  const { data: consensus, loading: consLoading } = useTickerConsensus(ticker);
  const { data: signals, loading: sigLoading } = useTickerSignals(ticker);

  if (consLoading || sigLoading) {
    return (
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: '10px', padding: '32px', textAlign: 'center'
      }}>
        <div style={{
          width: '24px', height: '24px', margin: '0 auto',
          border: '2px solid var(--border)', borderTop: '2px solid var(--signal-green)',
          borderRadius: '50%', animation: 'spin 1s linear infinite'
        }} />
      </div>
    );
  }

  if (!consensus) {
    return (
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: '10px', padding: '24px', textAlign: 'center'
      }}>
        <div style={{
          fontFamily: 'Cormorant Garamond', fontSize: '18px',
          color: 'var(--text-secondary)', marginBottom: '6px'
        }}>
          No SAIN consensus data for {ticker}
        </div>
        <div style={{
          fontFamily: 'IBM Plex Mono', fontSize: '11px',
          color: 'var(--text-dim)', lineHeight: 1.7
        }}>
          SAIN consensus is computed automatically when signals are detected.
          Check back after the next scan cycle.
        </div>
      </div>
    );
  }

  const dir = getDirBadge(consensus.consensus_direction);
  const recentSignals = (signals || []).slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: '10px', padding: '24px'
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '20px', flexWrap: 'wrap', gap: '12px'
      }}>
        <h3 style={{
          fontFamily: 'Cormorant Garamond', fontSize: '24px',
          fontWeight: 400, color: 'var(--text-primary)'
        }}>
          SAIN 4-Layer Consensus &mdash; {ticker}
        </h3>
        {consensus.is_full_stack_consensus && (
          <span style={{
            fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 500,
            color: 'var(--gold)', background: 'var(--gold-dim)',
            border: '1px solid rgba(201,168,76,0.25)',
            padding: '4px 10px', borderRadius: '4px'
          }}>
            &#127942; FULL STACK
          </span>
        )}
      </div>

      {/* Summary row */}
      <div style={{
        display: 'flex', gap: '24px', marginBottom: '20px', flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <div>
          <div style={{
            fontFamily: 'IBM Plex Mono', fontSize: '10px',
            color: 'var(--text-secondary)', letterSpacing: '0.1em', marginBottom: '2px'
          }}>
            TOTAL SCORE
          </div>
          <div style={{
            fontFamily: 'IBM Plex Mono', fontSize: '28px', fontWeight: 600,
            color: consensus.total_sain_score > 0 ? 'var(--signal-green)'
              : consensus.total_sain_score < 0 ? 'var(--red)' : 'var(--text-primary)'
          }}>
            {consensus.total_sain_score > 0 ? '+' : ''}{consensus.total_sain_score}
          </div>
        </div>
        <div>
          <div style={{
            fontFamily: 'IBM Plex Mono', fontSize: '10px',
            color: 'var(--text-secondary)', letterSpacing: '0.1em', marginBottom: '2px'
          }}>
            DIRECTION
          </div>
          <div style={{
            fontFamily: 'IBM Plex Mono', fontSize: '14px', fontWeight: 500,
            color: dir.color
          }}>
            {dir.label}
          </div>
        </div>
        <div>
          <div style={{
            fontFamily: 'IBM Plex Mono', fontSize: '10px',
            color: 'var(--text-secondary)', letterSpacing: '0.1em', marginBottom: '2px'
          }}>
            LAYERS ALIGNED
          </div>
          <div style={{
            fontFamily: 'IBM Plex Mono', fontSize: '14px', fontWeight: 500,
            color: consensus.layers_aligned === 4 ? 'var(--gold)' : 'var(--text-primary)'
          }}>
            {consensus.layers_aligned}/4
          </div>
        </div>
      </div>

      {/* 4-layer cards */}
      <div className="sain-consensus-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '12px',
        marginBottom: '24px'
      }}>
        {LAYERS.map(layer => {
          const score = consensus[layer.key] ?? 0;
          const colors = getScoreColor(score);
          return (
            <div key={layer.key} style={{
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              padding: '16px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '20px', marginBottom: '6px' }}>{layer.icon}</div>
              <div style={{
                fontFamily: 'IBM Plex Mono', fontSize: '10px', fontWeight: 500,
                color: 'var(--text-secondary)', letterSpacing: '0.06em',
                marginBottom: '8px'
              }}>
                {layer.label}
              </div>
              <div style={{
                fontFamily: 'IBM Plex Mono', fontSize: '22px', fontWeight: 600,
                color: colors.text, marginBottom: '6px'
              }}>
                {score > 0 ? '+' : ''}{score}
              </div>
              <LayerDetails layer={layer.key} consensus={consensus} />
            </div>
          );
        })}
      </div>

      {/* Recent signals */}
      {recentSignals.length > 0 && (
        <div>
          <div style={{
            fontFamily: 'IBM Plex Mono', fontSize: '10px',
            color: 'var(--text-secondary)', textTransform: 'uppercase',
            letterSpacing: '0.1em', marginBottom: '10px'
          }}>
            Recent Signals
          </div>
          {recentSignals.map((sig, i) => {
            const sigDate = sig.signal_date
              ? new Date(sig.signal_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : '';
            const source = sig.politician_name || sig.ai_model_name || sig.insider_name || sig.source_name || '';
            return (
              <div key={i} style={{
                fontFamily: 'IBM Plex Mono', fontSize: '11px',
                color: 'var(--text-secondary)', lineHeight: 1.8,
                paddingLeft: '12px',
                borderLeft: '2px solid var(--border)'
              }}>
                <span style={{ color: 'var(--text-dim)' }}>{sigDate}:</span>{' '}
                <span style={{ color: 'var(--text-primary)' }}>{source}</span>{' '}
                <span style={{
                  color: sig.direction === 'BUY' ? 'var(--signal-green)' : 'var(--red)'
                }}>
                  {sig.direction === 'BUY' ? 'bullish' : sig.direction === 'SELL' ? 'bearish' : sig.direction}
                </span>
                {sig.thesis_summary && (
                  <span> &mdash; &ldquo;{sig.thesis_summary.slice(0, 60)}{sig.thesis_summary.length > 60 ? '...' : ''}&rdquo;</span>
                )}
                {sig.trade_amount_range && (
                  <span> {sig.trade_amount_range}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

function LayerDetails({ layer, consensus }) {
  const style = {
    fontFamily: 'IBM Plex Mono', fontSize: '10px',
    color: 'var(--text-secondary)', lineHeight: 1.5
  };

  if (layer === 'super_investor_score') {
    return <div style={style}>from super investor consensus</div>;
  }
  if (layer === 'politician_score') {
    const trades = consensus.politician_trades || [];
    if (trades.length === 0) return <div style={style}>no recent trades</div>;
    return (
      <div style={style}>
        {trades.length} trade{trades.length !== 1 ? 's' : ''}
        {trades.some(t => t.committee_sector_match) ? ' (cmte match)' : ''}
      </div>
    );
  }
  if (layer === 'ai_model_score') {
    const sigs = consensus.ai_model_signals || [];
    if (sigs.length === 0) return <div style={style}>no recent signals</div>;
    const bullish = sigs.filter(s => s.direction === 'BUY').length;
    const bearish = sigs.filter(s => s.direction === 'SELL').length;
    return <div style={style}>{bullish} bullish, {bearish} bearish</div>;
  }
  if (layer === 'tli_score') {
    const score = consensus.tli_score;
    if (score >= 5) return <div style={style}>LOAD THE BOAT zone</div>;
    if (score >= 3) return <div style={style}>ACCUMULATE zone</div>;
    if (score >= 1) return <div style={style}>WATCH zone</div>;
    return <div style={style}>below threshold</div>;
  }
  return null;
}
