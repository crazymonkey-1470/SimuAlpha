import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const TYPE_CONFIG = {
  politician: {
    borderColor: (signal) => signal.party === 'D' ? '#3b82f6' : '#ef4444',
    label: (signal) => signal.chamber || 'CONGRESS',
    icon: '\u{1F3DB}',
  },
  ai_model: {
    borderColor: () => '#a855f7',
    label: (signal) => signal.ai_model_name || 'AI MODEL',
    icon: '\u{1F916}',
  },
  insider: {
    borderColor: () => '#f97316',
    label: (signal) => signal.insider_title || 'INSIDER',
    icon: '\u{1F4BC}',
  },
  market: {
    borderColor: () => '#6b7280',
    label: () => 'MARKET',
    icon: '\u{1F4F0}',
  },
};

function getSignalType(signal) {
  if (signal.politician_name) return 'politician';
  if (signal.ai_model_name) return 'ai_model';
  if (signal.insider_name) return 'insider';
  return 'market';
}

export default function SignalCard({ signal, index = 0, onSelect }) {
  const navigate = useNavigate();
  const type = getSignalType(signal);
  const config = TYPE_CONFIG[type];
  const borderColor = config.borderColor(signal);

  const dirColor = signal.direction === 'BUY' ? 'var(--signal-green)'
    : signal.direction === 'SELL' ? 'var(--red)' : 'var(--text-secondary)';

  const date = signal.signal_date
    ? new Date(signal.signal_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={() => onSelect ? onSelect(signal) : navigate(`/ticker/${signal.ticker}`)}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: '8px',
        padding: '16px 18px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
      whileHover={{
        borderColor: 'var(--border-light)',
        background: 'var(--bg-card-hover)',
      }}
    >
      {/* Header: icon + name + ticker + direction */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '10px', gap: '8px', flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>{config.icon}</span>
          <span style={{
            fontFamily: 'IBM Plex Mono', fontSize: '10px', fontWeight: 500,
            color: borderColor, background: `${borderColor}15`,
            padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase',
            letterSpacing: '0.06em'
          }}>
            {config.label(signal)}
          </span>

          {/* Source name */}
          <span style={{
            fontFamily: 'IBM Plex Mono', fontSize: '11px',
            color: 'var(--text-secondary)'
          }}>
            {signal.politician_name || signal.ai_model_name || signal.insider_name || signal.source_name || ''}
          </span>
        </div>

        <span style={{
          fontFamily: 'IBM Plex Mono', fontSize: '10px',
          color: 'var(--text-dim)'
        }}>
          {date}
        </span>
      </div>

      {/* Ticker + Direction */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px'
      }}>
        <span style={{
          fontFamily: 'IBM Plex Mono', fontSize: '15px', fontWeight: 600,
          color: 'var(--text-primary)'
        }}>
          {signal.ticker}
        </span>
        <span style={{
          fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 500,
          color: dirColor, background: `${dirColor}12`,
          padding: '2px 8px', borderRadius: '4px'
        }}>
          {signal.direction}
        </span>
      </div>

      {/* Type-specific content */}
      {type === 'politician' && (
        <PoliticianDetails signal={signal} />
      )}
      {type === 'ai_model' && (
        <AIModelDetails signal={signal} />
      )}
      {type === 'insider' && (
        <InsiderDetails signal={signal} />
      )}

      {/* Summary */}
      {signal.summary && (
        <div style={{
          fontFamily: 'IBM Plex Mono', fontSize: '11px',
          color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '8px',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }}>
          {signal.summary}
        </div>
      )}
    </motion.div>
  );
}

function PoliticianDetails({ signal }) {
  const filingDelay = signal.filing_delay_days;
  return (
    <div style={{
      display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center'
    }}>
      {/* Party badge */}
      {signal.party && (
        <span style={{
          fontFamily: 'IBM Plex Mono', fontSize: '10px', fontWeight: 500,
          color: signal.party === 'D' ? '#3b82f6' : '#ef4444',
          background: signal.party === 'D' ? 'rgba(59,130,246,0.12)' : 'rgba(239,68,68,0.08)',
          padding: '2px 6px', borderRadius: '3px'
        }}>
          {signal.party === 'D' ? 'DEM' : 'REP'}
        </span>
      )}

      {/* Amount */}
      {signal.trade_amount_range && (
        <span style={{
          fontFamily: 'IBM Plex Mono', fontSize: '10px',
          color: 'var(--text-secondary)'
        }}>
          {signal.trade_amount_range}
        </span>
      )}

      {/* Committee match */}
      {signal.committee_sector_match && (
        <span style={{
          fontFamily: 'IBM Plex Mono', fontSize: '10px', fontWeight: 500,
          color: 'var(--signal-green)',
          background: 'var(--signal-green-dim)',
          padding: '2px 6px', borderRadius: '3px'
        }}>
          COMMITTEE MATCH
        </span>
      )}
      {signal.committee_sector_match === false && (
        <span style={{
          fontFamily: 'IBM Plex Mono', fontSize: '10px',
          color: 'var(--text-dim)'
        }}>
          &#10134; no committee match
        </span>
      )}

      {/* Late filing */}
      {filingDelay != null && filingDelay > 45 && (
        <span style={{
          fontFamily: 'IBM Plex Mono', fontSize: '10px', fontWeight: 500,
          color: 'var(--signal-amber)',
          background: 'var(--signal-amber-dim)',
          padding: '2px 6px', borderRadius: '3px'
        }}>
          LATE FILING ({filingDelay}d)
        </span>
      )}
    </div>
  );
}

function AIModelDetails({ signal }) {
  const conviction = signal.conviction;
  const convictionColor = conviction === 'HIGH' ? 'var(--signal-green)'
    : conviction === 'MED' ? 'var(--signal-amber)' : 'var(--text-secondary)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {signal.thesis_summary && (
        <div style={{
          fontFamily: 'Cormorant Garamond', fontSize: '14px', fontStyle: 'italic',
          color: 'var(--text-primary)', lineHeight: 1.5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }}>
          &ldquo;{signal.thesis_summary}&rdquo;
        </div>
      )}
      {conviction && (
        <span style={{
          fontFamily: 'IBM Plex Mono', fontSize: '10px', fontWeight: 500,
          color: convictionColor, background: `${convictionColor}12`,
          padding: '2px 8px', borderRadius: '3px', alignSelf: 'flex-start'
        }}>
          {conviction} CONVICTION
        </span>
      )}
    </div>
  );
}

function InsiderDetails({ signal }) {
  return (
    <div style={{
      display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center'
    }}>
      {signal.insider_title && (
        <span style={{
          fontFamily: 'IBM Plex Mono', fontSize: '10px', fontWeight: 500,
          color: '#f97316', background: 'rgba(249,115,22,0.1)',
          padding: '2px 6px', borderRadius: '3px'
        }}>
          {signal.insider_title}
        </span>
      )}
      {signal.trade_amount_range && (
        <span style={{
          fontFamily: 'IBM Plex Mono', fontSize: '10px',
          color: 'var(--text-secondary)'
        }}>
          {signal.trade_amount_range}
        </span>
      )}
    </div>
  );
}
