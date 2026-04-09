import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import supabase from '../supabaseClient';
import { useInvestorHoldings, useInvestorSignals } from '../hooks/useInvestors';
import LoadingSpinner from '../components/LoadingSpinner';

export default function InvestorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [investor, setInvestor] = useState(null);
  const { data: holdings, loading: holdingsLoading } = useInvestorHoldings(id);
  const { data: signals, loading: signalsLoading } = useInvestorSignals(id);

  useEffect(() => {
    async function fetchInvestor() {
      const { data } = await supabase
        .from('super_investors')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      setInvestor(data);
    }
    if (id) fetchInvestor();
  }, [id]);

  if (!investor) return <LoadingSpinner />;

  const totalValue = holdings.reduce((sum, h) => sum + (h.market_value || 0), 0);
  const latestQuarter = signals.length > 0 ? signals[0].quarter : null;
  const latestSignals = signals.filter(s => s.quarter === latestQuarter);

  const newBuys = latestSignals.filter(s => s.signal_type === 'NEW_BUY');
  const adds = latestSignals.filter(s => s.signal_type === 'ADD');
  const reduces = latestSignals.filter(s => s.signal_type === 'REDUCE');
  const exits = latestSignals.filter(s => s.signal_type === 'EXIT');

  return (
    <div style={{ paddingTop: '48px' }}>
      <button
        onClick={() => navigate('/investors')}
        style={{
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px',
          color: 'var(--text-secondary)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          marginBottom: '24px',
        }}
      >
        &larr; Back to Investors
      </button>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: '32px' }}
      >
        <h1 style={{
          fontFamily: 'Cormorant Garamond',
          fontSize: '36px',
          fontWeight: 400,
          color: 'var(--text-primary)',
          marginBottom: '4px',
        }}>
          {investor.name}
        </h1>
        <div style={{
          fontFamily: 'IBM Plex Mono',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          marginBottom: '8px',
        }}>
          {investor.fund_name}
          {totalValue > 0 && (
            <span style={{ marginLeft: '12px', color: 'var(--text-dim)' }}>
              ${(totalValue / 1e9).toFixed(1)}B portfolio
            </span>
          )}
          {latestQuarter && (
            <span style={{ marginLeft: '12px', color: 'var(--text-dim)' }}>
              {latestQuarter}
            </span>
          )}
        </div>
        {investor.philosophy && (
          <div style={{
            fontFamily: 'IBM Plex Mono',
            fontSize: '11px',
            color: 'var(--text-dim)',
            maxWidth: '600px',
            lineHeight: 1.7,
          }}>
            {investor.philosophy}
          </div>
        )}
      </motion.div>

      {/* Holdings */}
      <div style={{ marginBottom: '48px' }}>
        <h2 style={{
          fontFamily: 'Cormorant Garamond',
          fontSize: '24px',
          fontWeight: 400,
          color: 'var(--text-primary)',
          marginBottom: '16px',
        }}>
          Top Holdings
        </h2>

        {holdingsLoading ? <LoadingSpinner /> : holdings.length === 0 ? (
          <div style={{
            fontFamily: 'IBM Plex Mono',
            fontSize: '11px',
            color: 'var(--text-dim)',
            padding: '20px',
            background: 'var(--bg-card)',
            borderRadius: '12px',
          }}>
            No holdings data available
          </div>
        ) : (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '40px 80px 1fr 100px 80px',
              gap: '8px',
              padding: '10px 16px',
              fontFamily: 'IBM Plex Mono',
              fontSize: '10px',
              color: 'var(--text-dim)',
              letterSpacing: '0.05em',
              borderBottom: '1px solid var(--border)',
            }}>
              <span>#</span>
              <span>TICKER</span>
              <span>COMPANY</span>
              <span style={{ textAlign: 'right' }}>VALUE</span>
              <span style={{ textAlign: 'right' }}>% PORT</span>
            </div>

            {holdings.slice(0, 20).map((h, i) => (
              <div
                key={h.ticker || i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 80px 1fr 100px 80px',
                  gap: '8px',
                  padding: '8px 16px',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
                onClick={() => h.ticker && navigate(`/ticker/${h.ticker}`)}
              >
                <span style={{ color: 'var(--text-dim)' }}>{h.portfolio_rank || i + 1}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{h.ticker}</span>
                <span style={{
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {h.company_name || '—'}
                </span>
                <span style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                  {h.market_value ? `$${(h.market_value / 1e6).toFixed(0)}M` : '—'}
                </span>
                <span style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                  {h.pct_of_portfolio != null ? `${h.pct_of_portfolio}%` : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quarterly Signals */}
      {latestQuarter && (
        <div style={{ marginBottom: '48px' }}>
          <h2 style={{
            fontFamily: 'Cormorant Garamond',
            fontSize: '24px',
            fontWeight: 400,
            color: 'var(--text-primary)',
            marginBottom: '16px',
          }}>
            {latestQuarter} Signals
          </h2>

          {signalsLoading ? <LoadingSpinner /> : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '12px',
            }}>
              {newBuys.length > 0 && (
                <SignalGroup title="NEW BUY" signals={newBuys} color="#00e87a" />
              )}
              {adds.length > 0 && (
                <SignalGroup title="ADD" signals={adds} color="#00e87a" />
              )}
              {reduces.length > 0 && (
                <SignalGroup title="REDUCE" signals={reduces} color="#e84444" />
              )}
              {exits.length > 0 && (
                <SignalGroup title="EXIT" signals={exits} color="#e84444" />
              )}
              {latestSignals.length === 0 && (
                <div style={{
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-dim)',
                }}>
                  No signals for this quarter
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SignalGroup({ title, signals, color }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '16px',
    }}>
      <div style={{
        fontFamily: 'IBM Plex Mono',
        fontSize: '11px',
        fontWeight: 600,
        color,
        letterSpacing: '0.08em',
        marginBottom: '10px',
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {signals.map((s) => (
          <div key={s.ticker} style={{
            fontFamily: 'IBM Plex Mono',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{s.ticker}</span>
            {s.pct_change != null && (
              <span style={{ color: s.pct_change > 0 ? '#00e87a' : '#e84444' }}>
                {s.pct_change > 0 ? '+' : ''}{Math.round(s.pct_change)}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
