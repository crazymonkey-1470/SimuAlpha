import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export default function PoliticianTradeDetail({ signal, onClose }) {
  const navigate = useNavigate();
  if (!signal) return null;

  const dirColor = signal.direction === 'BUY' ? 'var(--signal-green)' : 'var(--red)';
  const partyColor = signal.party === 'D' ? '#3b82f6' : '#ef4444';
  const filingDelay = signal.filing_delay_days;
  const date = signal.signal_date
    ? new Date(signal.signal_date).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      })
    : 'Unknown';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        padding: '24px'
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '28px 32px',
          maxWidth: '560px', width: '100%',
          maxHeight: '80vh', overflowY: 'auto'
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginBottom: '20px'
        }}>
          <div>
            <div style={{
              fontFamily: 'Cormorant Garamond', fontSize: '28px', fontWeight: 500,
              color: 'var(--text-primary)', marginBottom: '4px'
            }}>
              {signal.politician_name}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{
                fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 500,
                color: partyColor, background: `${partyColor}15`,
                padding: '2px 8px', borderRadius: '4px'
              }}>
                {signal.party === 'D' ? 'DEMOCRAT' : 'REPUBLICAN'}
              </span>
              {signal.chamber && (
                <span style={{
                  fontFamily: 'IBM Plex Mono', fontSize: '11px',
                  color: 'var(--text-secondary)'
                }}>
                  {signal.chamber}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: 'var(--text-secondary)',
            fontSize: '20px', cursor: 'pointer', padding: '4px'
          }}>
            &times;
          </button>
        </div>

        {/* Committees */}
        {signal.committees && signal.committees.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)',
              textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px'
            }}>
              Committees
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {(Array.isArray(signal.committees) ? signal.committees : [signal.committees]).map((c, i) => (
                <span key={i} style={{
                  fontFamily: 'IBM Plex Mono', fontSize: '10px',
                  color: 'var(--text-primary)', background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)', borderRadius: '4px',
                  padding: '4px 8px'
                }}>
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Trade details */}
        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: '8px', padding: '16px', marginBottom: '20px'
        }}>
          <div style={{
            fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)',
            textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px'
          }}>
            Trade Details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {[
              { label: 'Ticker', value: signal.ticker, color: 'var(--text-primary)', weight: 600 },
              { label: 'Direction', value: signal.direction, color: dirColor, weight: 600 },
              { label: 'Amount', value: signal.trade_amount_range || '\u2014' },
              { label: 'Date Filed', value: date },
              { label: 'Filing Delay', value: filingDelay != null ? `${filingDelay} days` : '\u2014',
                color: filingDelay > 45 ? 'var(--signal-amber)' : undefined },
            ].map(item => (
              <div key={item.label}>
                <div style={{
                  fontFamily: 'IBM Plex Mono', fontSize: '10px',
                  color: 'var(--text-dim)', marginBottom: '2px'
                }}>
                  {item.label}
                </div>
                <div style={{
                  fontFamily: 'IBM Plex Mono', fontSize: '13px',
                  color: item.color || 'var(--text-primary)',
                  fontWeight: item.weight || 400
                }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Committee match indicator */}
        <div style={{
          padding: '12px 16px', borderRadius: '8px', marginBottom: '20px',
          background: signal.committee_sector_match
            ? 'var(--signal-green-dim)' : 'var(--bg-secondary)',
          border: `1px solid ${signal.committee_sector_match
            ? 'rgba(0,232,122,0.2)' : 'var(--border)'}`,
        }}>
          <div style={{
            fontFamily: 'IBM Plex Mono', fontSize: '12px', fontWeight: 500,
            color: signal.committee_sector_match ? 'var(--signal-green)' : 'var(--text-secondary)'
          }}>
            {signal.committee_sector_match
              ? '\u2705 Committee jurisdiction matches this trade sector'
              : '\u2796 No committee jurisdiction match for this trade'}
          </div>
          {signal.committee_sector_match && (
            <div style={{
              fontFamily: 'IBM Plex Mono', fontSize: '10px',
              color: 'var(--text-secondary)', marginTop: '4px'
            }}>
              This politician sits on a committee with oversight of the sector this stock belongs to.
              Trades with committee matches carry higher signal weight.
            </div>
          )}
        </div>

        {/* Summary */}
        {signal.summary && (
          <div style={{
            fontFamily: 'IBM Plex Mono', fontSize: '11px',
            color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '20px'
          }}>
            {signal.summary}
          </div>
        )}

        {/* Source link */}
        {signal.source_url && (
          <a
            href={signal.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: 'IBM Plex Mono', fontSize: '11px',
              color: 'var(--blue)', textDecoration: 'underline',
              display: 'block', marginBottom: '16px'
            }}
          >
            View original source &rarr;
          </a>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => navigate(`/ticker/${signal.ticker}`)}
            style={{
              flex: 1, background: 'var(--signal-green-dim)',
              border: '1px solid rgba(0,232,122,0.25)',
              borderRadius: '6px', padding: '10px',
              fontFamily: 'IBM Plex Mono', fontSize: '12px',
              color: 'var(--signal-green)', cursor: 'pointer'
            }}
          >
            View {signal.ticker} DeepDive &rarr;
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: '6px', padding: '10px 20px',
              fontFamily: 'IBM Plex Mono', fontSize: '12px',
              color: 'var(--text-secondary)', cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </motion.div>
  );
}
