import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useScreenerResults, useScanHistory, useConfluenceZones, useGenerationalBuys } from '../hooks/useScreener';
import OpportunityCard from '../components/OpportunityCard';
import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import MarketRiskBanner from '../components/MarketRiskBanner';

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: allStocks, loading } = useScreenerResults();
  const { data: scanHistory } = useScanHistory();
  const { data: confluenceStocks, loading: confluenceLoading } = useConfluenceZones();
  const { data: generationalBuys, loading: genLoading } = useGenerationalBuys();

  const topOpportunities = allStocks
    .filter(s => s.signal === 'LOAD THE BOAT')
    .slice(0, 6);

  const accumulate = allStocks.filter(s => s.signal === 'ACCUMULATE').length;
  const loadTheBoat = allStocks.filter(s => s.signal === 'LOAD THE BOAT').length;
  const entryZone = allStocks.filter(s => s.entry_zone).length;
  const lastScan = scanHistory[0]?.scanned_at;

  return (
    <div style={{ paddingTop: '48px' }}>
      <MarketRiskBanner />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: '64px', position: 'relative' }}
      >
        <div style={{
          position: 'absolute',
          top: 0, left: '-24px', right: '-24px',
          height: '1px',
          background: 'linear-gradient(90deg, transparent, var(--signal-green)40, transparent)',
          animation: 'scan-line 4s ease infinite'
        }} />

        <div style={{
          fontFamily: 'Cormorant Garamond',
          fontSize: 'clamp(48px, 8vw, 96px)',
          fontWeight: 300,
          color: 'var(--text-primary)',
          lineHeight: 0.9,
          marginBottom: '24px'
        }}>
          The Long<br />
          <span style={{ color: 'var(--signal-green)', fontStyle: 'italic' }}>
            Screener
          </span>
        </div>

        <div style={{
          fontFamily: 'IBM Plex Mono',
          fontSize: '13px',
          color: 'var(--text-secondary)',
          maxWidth: '480px',
          lineHeight: 1.7,
          marginBottom: '32px'
        }}>
          Scanning {allStocks.length.toLocaleString()} stocks for
          fundamentally undervalued positions at or below their
          200 Weekly and Monthly Moving Averages.
        </div>

        <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
          {[
            { label: 'STOCKS SCANNED', value: allStocks.length.toLocaleString() },
            { label: 'LOAD THE BOAT', value: loadTheBoat, color: 'var(--signal-green)' },
            { label: 'ACCUMULATE', value: accumulate, color: 'var(--signal-amber)' },
            { label: 'ENTRY ZONES', value: entryZone, color: 'var(--gold)' },
          ].map(stat => (
            <div key={stat.label}>
              <div style={{
                fontFamily: 'IBM Plex Mono', fontSize: '10px',
                color: 'var(--text-secondary)', letterSpacing: '0.12em', marginBottom: '4px'
              }}>
                {stat.label}
              </div>
              <div style={{
                fontFamily: 'IBM Plex Mono', fontSize: '28px',
                fontWeight: 500, color: stat.color || 'var(--text-primary)'
              }}>
                {loading ? '\u2014' : stat.value}
              </div>
            </div>
          ))}
        </div>

        {lastScan && (
          <div style={{
            marginTop: '16px', fontFamily: 'IBM Plex Mono',
            fontSize: '11px', color: 'var(--text-dim)'
          }}>
            Last scan: {new Date(lastScan).toLocaleString()}
          </div>
        )}
      </motion.div>

      {/* Generational Buy Zones */}
      <div style={{ marginBottom: '48px' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'baseline', marginBottom: '24px'
        }}>
          <h2 style={{
            fontFamily: 'Cormorant Garamond', fontSize: '32px',
            fontWeight: 400, color: '#00bfff'
          }}>
            Generational Buy Zones
          </h2>
          <span style={{
            fontFamily: 'IBM Plex Mono', fontSize: '11px',
            color: 'var(--text-dim)'
          }}>
            0.786 Fib + Wave Origin + 200MMA
          </span>
        </div>

        {genLoading ? (
          <LoadingSpinner />
        ) : generationalBuys.length === 0 ? (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid rgba(0,191,255,0.15)',
            borderRadius: '12px',
            padding: '32px',
            textAlign: 'center'
          }}>
            <div style={{
              fontFamily: 'Cormorant Garamond', fontSize: '20px',
              fontWeight: 400, color: 'var(--text-secondary)', marginBottom: '8px'
            }}>
              No generational buy zones detected
            </div>
            <div style={{
              fontFamily: 'IBM Plex Mono', fontSize: '11px',
              color: 'var(--text-dim)', lineHeight: 1.7
            }}>
              Generational buys require 3-level convergence: 0.786 Fibonacci retracement, Wave 1 origin,
              and 200 Monthly Moving Average all within 15% of each other. These are the rarest and
              highest-conviction TLI setups.
            </div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '16px'
          }}>
            {generationalBuys.map((stock, i) => (
              <OpportunityCard key={stock.ticker} stock={stock} index={i} />
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '48px' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'baseline', marginBottom: '24px'
        }}>
          <h2 style={{
            fontFamily: 'Cormorant Garamond', fontSize: '32px',
            fontWeight: 400, color: 'var(--gold, #D4A017)'
          }}>
            Confluence Zones
          </h2>
          <span style={{
            fontFamily: 'IBM Plex Mono', fontSize: '11px',
            color: 'var(--text-dim)'
          }}>
            200WMA + 0.618 Fib
          </span>
        </div>

        {confluenceLoading ? (
          <LoadingSpinner />
        ) : confluenceStocks.length === 0 ? (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--gold, #D4A017)20',
            borderRadius: '12px',
            padding: '32px',
            textAlign: 'center'
          }}>
            <div style={{
              fontFamily: 'Cormorant Garamond', fontSize: '20px',
              fontWeight: 400, color: 'var(--text-secondary)', marginBottom: '8px'
            }}>
              No confluence zones detected
            </div>
            <div style={{
              fontFamily: 'IBM Plex Mono', fontSize: '11px',
              color: 'var(--text-dim)', lineHeight: 1.7
            }}>
              Confluence zones are rare and high conviction. They occur when the 200 Weekly Moving Average
              and the 0.618 Fibonacci retracement converge at the same price level. When one appears, it
              will show here first.
            </div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '16px'
          }}>
            {confluenceStocks.map((stock, i) => (
              <OpportunityCard key={stock.ticker} stock={stock} index={i} />
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '48px' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'baseline', marginBottom: '24px'
        }}>
          <h2 style={{
            fontFamily: 'Cormorant Garamond', fontSize: '32px',
            fontWeight: 400, color: 'var(--text-primary)'
          }}>
            Top Opportunities
          </h2>
          <button
            onClick={() => navigate('/screener')}
            style={{
              fontFamily: 'IBM Plex Mono', fontSize: '11px',
              color: 'var(--text-secondary)', background: 'transparent',
              border: 'none', cursor: 'pointer', textDecoration: 'underline'
            }}
          >
            View all &rarr;
          </button>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : topOpportunities.length === 0 ? (
          <EmptyState
            message="Pipeline initializing"
            sub="First scan in progress. Top opportunities will appear here once complete."
          />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '16px'
          }}>
            {topOpportunities.map((stock, i) => (
              <OpportunityCard key={stock.ticker} stock={stock} index={i} />
            ))}
          </div>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '32px', marginBottom: '48px'
        }}
      >
        <h3 style={{
          fontFamily: 'Cormorant Garamond', fontSize: '24px',
          fontWeight: 400, marginBottom: '20px', color: 'var(--text-primary)'
        }}>
          How This Works
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '24px'
        }}>
          {[
            { step: '01', title: 'Universe Scan', desc: 'S&P 500 scanned twice weekly (Sun + Wed) for fundamental quality \u2014 revenue growth, valuation, and drawdown from highs.' },
            { step: '02', title: 'TLI Scoring', desc: 'Each stock scored 0-100 on two pillars: fundamentals (50pts) and technical position relative to 200WMA/MMA (50pts).' },
            { step: '03', title: 'Elliott Wave', desc: 'High-scoring stocks analyzed for wave position. Only Wave 2, 4, or C entries flagged. Wave 5 always avoided.' },
            { step: '04', title: 'Entry Signals', desc: 'When a stock hits the TLI sweet spot \u2014 fundamentally undervalued AND at its 200MA \u2014 you get alerted.' },
          ].map(item => (
            <div key={item.step}>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--signal-green)', marginBottom: '8px' }}>
                {item.step}
              </div>
              <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '18px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>
                {item.title}
              </div>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                {item.desc}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-dim)', padding: '20px 0', borderTop: '1px solid var(--border)' }}>
        Not financial advice. AI-generated analysis for educational purposes only. Do your own research before investing.
      </div>
    </div>
  );
}
