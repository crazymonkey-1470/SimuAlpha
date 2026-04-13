import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useInvestors, useConsensusSummary } from '../hooks/useInvestors';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import supabase from '../supabaseClient';

export default function SuperInvestors() {
  const navigate = useNavigate();
  const { data: investors, loading: investorsLoading } = useInvestors();
  const { topBuys, topSells, loading: consensusLoading } = useConsensusSummary();
  const [crossConsensus, setCrossConsensus] = useState([]);
  const [recentSignals, setRecentSignals] = useState([]);

  useEffect(() => {
    // Cross-investor consensus: group holdings by ticker
    async function fetchCross() {
      const { data: holdings } = await supabase
        .from('investor_holdings')
        .select('ticker, investor_id, company_name, super_investors(name)')
        .order('ticker');
      if (!holdings) return;

      const byTicker = {};
      for (const h of holdings) {
        if (!byTicker[h.ticker]) byTicker[h.ticker] = { ticker: h.ticker, company: h.company_name, investors: [] };
        const name = h.super_investors?.name || `ID:${h.investor_id}`;
        if (!byTicker[h.ticker].investors.includes(name)) {
          byTicker[h.ticker].investors.push(name);
        }
      }
      const sorted = Object.values(byTicker)
        .filter(t => t.investors.length >= 2)
        .sort((a, b) => b.investors.length - a.investors.length)
        .slice(0, 20);
      setCrossConsensus(sorted);
    }

    // Recent investor signals
    async function fetchRecentSignals() {
      const { data: signals } = await supabase
        .from('investor_signals')
        .select('ticker, signal_type, pct_change, quarter, super_investors(name)')
        .order('quarter', { ascending: false })
        .limit(20);
      setRecentSignals(signals || []);
    }

    fetchCross();
    fetchRecentSignals();
  }, []);

  return (
    <div style={{ paddingTop: '48px' }}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: '48px' }}
      >
        <h1 style={{
          fontFamily: 'Cormorant Garamond',
          fontSize: 'clamp(36px, 6vw, 64px)',
          fontWeight: 300,
          color: 'var(--text-primary)',
          lineHeight: 0.9,
          marginBottom: '16px',
        }}>
          Super Investor<br />
          <span style={{ color: 'var(--gold)', fontStyle: 'italic' }}>Consensus</span>
        </h1>
        <p style={{
          fontFamily: 'IBM Plex Mono',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          maxWidth: '500px',
          lineHeight: 1.7,
        }}>
          Tracking 8 of the world's most successful investors via SEC 13F filings.
          Cross-referencing their positions to find consensus picks and sector trends.
        </p>
      </motion.div>

      {/* Consensus Signals */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '16px',
        marginBottom: '48px',
      }}>
        {/* Top Buys */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '20px',
          }}
        >
          <h3 style={{
            fontFamily: 'Cormorant Garamond',
            fontSize: '20px',
            fontWeight: 400,
            color: '#00e87a',
            marginBottom: '16px',
          }}>
            Top Consensus Buys
          </h3>
          {consensusLoading ? <LoadingSpinner /> : topBuys.length === 0 ? (
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-dim)' }}>
              No consensus data yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {topBuys.map((item) => (
                <ConsensusRow key={item.ticker} item={item} type="buy" />
              ))}
            </div>
          )}
        </motion.div>

        {/* Top Sells */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '20px',
          }}
        >
          <h3 style={{
            fontFamily: 'Cormorant Garamond',
            fontSize: '20px',
            fontWeight: 400,
            color: '#e84444',
            marginBottom: '16px',
          }}>
            Top Consensus Sells
          </h3>
          {consensusLoading ? <LoadingSpinner /> : topSells.length === 0 ? (
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-dim)' }}>
              No sell signals yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {topSells.map((item) => (
                <ConsensusRow key={item.ticker} item={item} type="sell" />
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Investor Profiles */}
      <div style={{ marginBottom: '48px' }}>
        <h2 style={{
          fontFamily: 'Cormorant Garamond',
          fontSize: '28px',
          fontWeight: 400,
          color: 'var(--text-primary)',
          marginBottom: '20px',
        }}>
          Tracked Investors
        </h2>

        {investorsLoading ? <LoadingSpinner /> : investors.length === 0 ? (
          <EmptyState message="No investors tracked" sub="Investor data will appear after the institutional tracker runs." />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '12px',
          }}>
            {investors.map((inv, i) => (
              <motion.div
                key={inv.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => navigate(`/investor/${inv.id}`)}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
                onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--border-light)'}
                onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{
                  fontFamily: 'Cormorant Garamond',
                  fontSize: '18px',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  marginBottom: '4px',
                }}>
                  {inv.name}
                </div>
                <div style={{
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '10px',
                  color: 'var(--text-dim)',
                  marginBottom: '6px',
                }}>
                  {inv.fund_name || inv.cik}
                </div>
                {inv.philosophy && (
                  <div style={{
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '10px',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.6,
                  }}>
                    {inv.philosophy}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Cross-Investor Consensus */}
      {crossConsensus.length > 0 && (
        <div style={{ marginBottom: '48px' }}>
          <h2 style={{
            fontFamily: 'Cormorant Garamond', fontSize: '28px',
            fontWeight: 400, color: 'var(--gold)', marginBottom: '20px',
          }}>
            Cross-Investor Consensus
          </h2>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '12px', overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Ticker', 'Company', 'Investors', 'Count'].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px', textAlign: 'left',
                      fontFamily: 'IBM Plex Mono', fontSize: '10px',
                      color: 'var(--text-secondary)', textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {crossConsensus.map((item) => (
                  <tr
                    key={item.ticker}
                    onClick={() => navigate(`/ticker/${item.ticker}`)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  >
                    <td style={{ padding: '10px 16px', fontFamily: 'Cormorant Garamond', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.ticker}
                    </td>
                    <td style={{ padding: '10px 16px', fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {item.company?.substring(0, 25) || '\u2014'}
                    </td>
                    <td style={{ padding: '10px 16px', fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)' }}>
                      {item.investors.join(', ')}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        fontFamily: 'IBM Plex Mono', fontSize: '12px', fontWeight: 600,
                        color: item.investors.length >= 4 ? '#10b981' : item.investors.length >= 3 ? '#f59e0b' : 'var(--text-primary)',
                      }}>
                        {item.investors.length}
                        {item.investors.length >= 4 ? ' \u2B50' : ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Changes Feed */}
      {recentSignals.length > 0 && (
        <div style={{ marginBottom: '48px' }}>
          <h2 style={{
            fontFamily: 'Cormorant Garamond', fontSize: '28px',
            fontWeight: 400, color: 'var(--text-primary)', marginBottom: '20px',
          }}>
            Recent Changes
          </h2>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '12px', padding: '16px 20px',
          }}>
            {recentSignals.map((sig, i) => {
              const isNew = sig.signal_type === 'NEW_POSITION';
              const isExit = sig.signal_type === 'EXIT';
              const isAdd = sig.signal_type === 'ADD';
              const color = isExit ? '#ef4444' : isNew || isAdd ? '#10b981' : '#f59e0b';
              const icon = isExit ? '\u{1F534}' : isNew ? '\u{1F7E2}' : isAdd ? '\u{1F7E2}' : '\u{1F7E1}';
              const pctStr = sig.pct_change != null ? ` ${sig.pct_change > 0 ? '+' : ''}${sig.pct_change}%` : '';
              return (
                <div key={i} style={{
                  padding: '8px 0',
                  borderBottom: i < recentSignals.length - 1 ? '1px solid var(--border)' : 'none',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-primary)' }}>
                    <span>{icon} </span>
                    <span style={{ fontWeight: 600 }}>{sig.super_investors?.name || 'Investor'}</span>
                    <span style={{ color }}> {sig.signal_type?.replace(/_/g, ' ')}</span>
                    <span> {sig.ticker}</span>
                    <span style={{ color: 'var(--text-dim)' }}>{pctStr}</span>
                  </div>
                  <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)' }}>
                    {sig.quarter}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ConsensusRow({ item, type }) {
  const color = type === 'buy' ? '#00e87a' : '#e84444';
  const score = item.consensus_score;

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '6px 0',
      borderBottom: '1px solid var(--border)',
      fontFamily: 'IBM Plex Mono',
      fontSize: '11px',
    }}>
      <div>
        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{item.ticker}</span>
        {item.holder_count != null && (
          <span style={{ color: 'var(--text-dim)', marginLeft: '8px' }}>
            ({item.holder_count} holders)
          </span>
        )}
      </div>
      <span style={{ color, fontWeight: 600 }}>
        {score > 0 ? '+' : ''}{score}
      </span>
    </div>
  );
}
