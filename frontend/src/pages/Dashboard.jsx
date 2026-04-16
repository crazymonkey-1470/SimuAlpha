import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useScreenerResults, useScanHistory, useConfluenceZones, useGenerationalBuys, useLastPipelineRun } from '../hooks/useScreener';
import { useSAINStats } from '../hooks/useSAIN';
import OpportunityCard from '../components/OpportunityCard';
import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import MarketRiskBanner from '../components/MarketRiskBanner';
import FullStackConsensusBanner from '../components/FullStackConsensusBanner';
import SAINStatsWidget from '../components/SAINStatsWidget';
import ScoreDistribution from '../components/ScoreDistribution';
import Onboarding, { useOnboarding } from '../components/Onboarding';
import usePageTitle from '../hooks/usePageTitle';

export default function Dashboard() {
  usePageTitle('Dashboard');
  const navigate = useNavigate();
  const { data: allStocks, loading } = useScreenerResults();
  const { data: scanHistory } = useScanHistory();
  const { data: confluenceStocks, loading: confluenceLoading } = useConfluenceZones();
  const { data: generationalBuys, loading: genLoading } = useGenerationalBuys();
  const lastPipelineRun = useLastPipelineRun();
  const { stats: sainStats } = useSAINStats();
  const { showOnboarding, dismiss: dismissOnboarding } = useOnboarding();

  const topOpportunities = allStocks
    .filter(s => s.signal === 'LOAD THE BOAT')
    .slice(0, 6);

  const accumulate = allStocks.filter(s => s.signal === 'ACCUMULATE').length;
  const loadTheBoat = allStocks.filter(s => s.signal === 'LOAD THE BOAT').length;
  const lastScan = scanHistory[0]?.scanned_at;

  return (
    <div style={{ paddingTop: '48px' }}>
      {showOnboarding && <Onboarding onDismiss={dismissOnboarding} />}
      <FullStackConsensusBanner />
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
            { label: 'ACTIVE SAIN SOURCES', value: sainStats?.sourcesActive ?? '\u2014', color: 'var(--blue)' },
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

        <div style={{
          marginTop: '16px', fontFamily: 'IBM Plex Mono',
          fontSize: '11px', color: 'var(--text-dim)', display: 'flex', gap: '16px'
        }}>
          {lastPipelineRun && <span>Last scan: {formatTimeAgo(lastPipelineRun)}</span>}
          {!lastPipelineRun && lastScan && <span>Last scan: {formatTimeAgo(lastScan)}</span>}
        </div>
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
            Generational Support Zones
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
              No generational support zones detected
            </div>
            <div style={{
              fontFamily: 'IBM Plex Mono', fontSize: '11px',
              color: 'var(--text-dim)', lineHeight: 1.7
            }}>
              Generational support zones require 3-level convergence: 0.786 Fibonacci retracement, Wave 1 origin,
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

      {/* Score Distribution + Sector Heatmap */}
      <div style={{ marginBottom: '48px' }}>
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{
            fontFamily: 'Cormorant Garamond', fontSize: '32px',
            fontWeight: 400, color: 'var(--text-primary)'
          }}>
            Market Overview
          </h2>
        </div>
        <ScoreDistribution />
      </div>

      {/* SAIN Network Stats */}
      <div style={{ marginBottom: '48px' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'baseline', marginBottom: '24px'
        }}>
          <h2 style={{
            fontFamily: 'Cormorant Garamond', fontSize: '32px',
            fontWeight: 400, color: 'var(--blue)'
          }}>
            Intelligence Network
          </h2>
        </div>
        <SAINStatsWidget />
      </div>

      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-dim)', padding: '20px 0', borderTop: '1px solid var(--border)' }}>
        Not financial advice. AI-generated analysis for educational purposes only. Do your own research before investing.
      </div>
    </div>
  );
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'less than 1 hour ago';
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}
