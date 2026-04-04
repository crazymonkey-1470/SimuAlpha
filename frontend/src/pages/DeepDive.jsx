import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTickerDetail } from '../hooks/useScreener';
import ScoreRing from '../components/ScoreRing';
import SignalBadge from '../components/SignalBadge';
import MetricCard from '../components/MetricCard';
import LoadingSpinner from '../components/LoadingSpinner';
import supabase from '../supabaseClient';
import { useState } from 'react';

export default function DeepDive() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const { result, waveCount, backtest, loading } = useTickerDetail(symbol);
  const [watchlisted, setWatchlisted] = useState(false);

  async function addToWatchlist() {
    await supabase.from('watchlist').insert({ ticker: symbol, notes: '' });
    setWatchlisted(true);
  }

  if (loading) return <LoadingSpinner />;

  if (!result) return (
    <div style={{ paddingTop: '40px' }}>
      <button onClick={() => navigate(-1)} style={{
        background: 'transparent', border: 'none', color: 'var(--text-secondary)',
        fontFamily: 'IBM Plex Mono', fontSize: '12px', cursor: 'pointer', marginBottom: '24px'
      }}>
        &larr; Back
      </button>
      <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '32px', color: 'var(--text-secondary)' }}>
        {symbol} not yet scored
      </div>
      <p style={{ fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-dim)', marginTop: '12px' }}>
        This ticker will appear after the next pipeline run.
      </p>
    </div>
  );

  return (
    <div style={{ paddingTop: '40px' }}>
      <button onClick={() => navigate(-1)} style={{
        background: 'transparent', border: 'none', color: 'var(--text-secondary)',
        fontFamily: 'IBM Plex Mono', fontSize: '12px', cursor: 'pointer', marginBottom: '32px', display: 'block'
      }}>
        &larr; Back to Screener
      </button>

      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        style={{ display: 'flex', gap: '32px', alignItems: 'flex-start', marginBottom: '40px', flexWrap: 'wrap' }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '72px', fontWeight: 600, lineHeight: 0.9, color: 'var(--text-primary)', marginBottom: '8px' }}>
            {symbol}
          </div>
          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            {result.company_name} {result.sector ? `\u00B7 ${result.sector}` : ''}
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <SignalBadge signal={result.signal} size="lg" />
            {result.entry_zone && (
              <span style={{
                fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--signal-green)',
                background: 'var(--signal-green-dim)', border: '1px solid var(--signal-green)30',
                borderRadius: '4px', padding: '6px 12px'
              }}>
                Entry Zone Active
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <ScoreRing score={result.total_score} size={100} />
          <button onClick={addToWatchlist} disabled={watchlisted} style={{
            background: watchlisted ? 'var(--bg-card)' : 'var(--signal-green-dim)',
            border: `1px solid ${watchlisted ? 'var(--border)' : 'var(--signal-green)40'}`,
            borderRadius: '8px', padding: '12px 20px',
            color: watchlisted ? 'var(--text-secondary)' : 'var(--signal-green)',
            fontFamily: 'IBM Plex Mono', fontSize: '12px',
            cursor: watchlisted ? 'default' : 'pointer'
          }}>
            {watchlisted ? '\u2713 Watchlisted' : '+ Add to Watchlist'}
          </button>
        </div>
      </motion.div>

      {/* Entry note */}
      {result.entry_note && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          style={{
            background: 'var(--signal-green-dim)', border: '1px solid var(--signal-green)30',
            borderRadius: '8px', padding: '16px 20px', marginBottom: '32px',
            fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--signal-green)', lineHeight: 1.7
          }}
        >
          {result.entry_note}
        </motion.div>
      )}

      {/* Score breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '24px' }}>
          <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '22px', marginBottom: '16px', color: 'var(--text-primary)' }}>
            Fundamental Score
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '14px', color: 'var(--signal-amber)', marginLeft: '12px' }}>
              {result.fundamental_score}/50
            </span>
          </div>
          {[
            { label: 'Revenue Growth', value: `${result.revenue_growth_pct?.toFixed(1)}% YoY`, good: result.revenue_growth_pct > 10 },
            { label: 'From 52W High', value: `${result.pct_from_52w_high?.toFixed(1)}%`, good: result.pct_from_52w_high < -25 },
            { label: 'P/S Ratio', value: result.ps_ratio?.toFixed(1) ?? '\u2014', good: result.ps_ratio < 5 },
            { label: 'P/E Ratio', value: result.pe_ratio?.toFixed(1) ?? '\u2014', good: result.pe_ratio < 20 },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-secondary)' }}>{item.label}</span>
              <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '12px', color: item.good ? 'var(--signal-green)' : 'var(--text-primary)' }}>{item.value}</span>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '24px' }}>
          <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '22px', marginBottom: '16px', color: 'var(--text-primary)' }}>
            Technical Score
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '14px', color: 'var(--signal-amber)', marginLeft: '12px' }}>
              {result.technical_score}/50
            </span>
          </div>
          {[
            { label: 'Current Price', value: `$${result.current_price?.toFixed(2)}` },
            { label: '200 Weekly MA', value: result.price_200wma ? `$${result.price_200wma?.toFixed(2)}` : '\u2014', good: result.pct_from_200wma <= 0 },
            { label: '200 Monthly MA', value: result.price_200mma ? `$${result.price_200mma?.toFixed(2)}` : '\u2014', good: result.pct_from_200mma <= 0 },
            { label: '% from 200WMA', value: `${result.pct_from_200wma?.toFixed(1)}%`, good: result.pct_from_200wma <= 0 },
            { label: '% from 200MMA', value: `${result.pct_from_200mma?.toFixed(1)}%`, good: result.pct_from_200mma <= 0 },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-secondary)' }}>{item.label}</span>
              <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '12px', color: item.good ? 'var(--signal-green)' : 'var(--text-primary)' }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Key metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '32px' }}>
        <MetricCard label="Revenue (Current)" value={result.revenue_current ? `$${(result.revenue_current / 1e9).toFixed(1)}B` : '\u2014'} />
        <MetricCard label="Revenue (Prior)" value={result.revenue_prior_year ? `$${(result.revenue_prior_year / 1e9).toFixed(1)}B` : '\u2014'} />
        <MetricCard label="Rev Growth" value={`${result.revenue_growth_pct?.toFixed(1)}%`} highlight={result.revenue_growth_pct > 10} />
        <MetricCard label="52W High" value={`$${result.week_52_high?.toFixed(2)}`} />
        <MetricCard label="From 52W High" value={`${result.pct_from_52w_high?.toFixed(1)}%`} highlight={result.pct_from_52w_high < -25} />
        <MetricCard label="P/E Ratio" value={result.pe_ratio?.toFixed(1) ?? '\u2014'} />
        <MetricCard label="P/S Ratio" value={result.ps_ratio?.toFixed(1) ?? '\u2014'} />
      </div>

      {/* Wave Count */}
      {waveCount && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '24px', marginBottom: '24px' }}
        >
          <h3 style={{ fontFamily: 'Cormorant Garamond', fontSize: '24px', fontWeight: 400, marginBottom: '20px', color: 'var(--text-primary)' }}>
            Elliott Wave Analysis
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            {[
              { label: 'Structure', value: waveCount.wave_structure },
              { label: 'Current Wave', value: waveCount.current_wave },
              { label: 'Timeframe', value: waveCount.timeframe },
              { label: 'Confidence', value: `${waveCount.confidence_score}% \u2014 ${waveCount.confidence_label}`,
                color: waveCount.confidence_score >= 80 ? 'var(--signal-green)' : waveCount.confidence_score >= 60 ? 'var(--signal-amber)' : 'var(--text-secondary)' },
            ].map(item => (
              <div key={item.label}>
                <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>{item.label}</div>
                <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '14px', color: item.color || 'var(--text-primary)', textTransform: 'capitalize' }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* TLI Signal */}
          <div style={{
            padding: '12px 16px',
            background: waveCount.tli_signal === 'BUY_ZONE' ? 'var(--signal-green-dim)' : waveCount.tli_signal === 'AVOID' ? 'rgba(232, 68, 68, 0.08)' : 'var(--bg-secondary)',
            border: `1px solid ${waveCount.tli_signal === 'BUY_ZONE' ? 'var(--signal-green)30' : waveCount.tli_signal === 'AVOID' ? 'rgba(232, 68, 68, 0.2)' : 'var(--border)'}`,
            borderRadius: '6px', marginBottom: '16px'
          }}>
            <div style={{
              fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 500, marginBottom: '4px',
              color: waveCount.tli_signal === 'BUY_ZONE' ? 'var(--signal-green)' : waveCount.tli_signal === 'AVOID' ? 'var(--red)' : 'var(--text-secondary)'
            }}>
              {waveCount.tli_signal}
            </div>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {waveCount.tli_signal_reason}
            </div>
          </div>

          {/* Fib levels */}
          {waveCount.entry_zone_low && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
              {[
                { label: 'Entry Zone', value: `$${waveCount.entry_zone_low?.toFixed(2)} \u2014 $${waveCount.entry_zone_high?.toFixed(2)}`, color: 'var(--signal-green)' },
                { label: 'Stop Loss', value: `$${waveCount.stop_loss?.toFixed(2)}`, color: 'var(--red)' },
                { label: 'Target 1', value: `$${waveCount.target_1?.toFixed(2)}`, color: 'var(--signal-amber)' },
                { label: 'Target 2', value: waveCount.target_2 ? `$${waveCount.target_2?.toFixed(2)}` : '\u2014', color: 'var(--signal-green)' },
                { label: 'R/R Ratio', value: `${waveCount.reward_risk_ratio?.toFixed(1)}x`, color: waveCount.reward_risk_ratio >= 2 ? 'var(--signal-green)' : 'var(--text-secondary)' },
              ].map(item => (
                <div key={item.label} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 12px' }}>
                  <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.label}</div>
                  <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '13px', color: item.color, fontWeight: 500 }}>{item.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Claude interpretation */}
          {waveCount.claude_interpretation && !waveCount.claude_interpretation.error && (
            <div style={{
              marginTop: '20px', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderLeft: `3px solid ${waveCount.claude_interpretation.conviction === 'HIGH' ? 'var(--signal-green)' : 'var(--signal-amber)'}`,
              borderRadius: '6px', padding: '16px 20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>AI Analysis</span>
                <span style={{
                  fontFamily: 'IBM Plex Mono', fontSize: '11px',
                  color: waveCount.claude_interpretation.conviction === 'HIGH' ? 'var(--signal-green)' : 'var(--signal-amber)'
                }}>
                  {waveCount.claude_interpretation.conviction} CONVICTION
                </span>
              </div>
              <p style={{ fontFamily: 'Cormorant Garamond', fontSize: '17px', fontStyle: 'italic', color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: '12px' }}>
                &ldquo;{waveCount.claude_interpretation.one_liner}&rdquo;
              </p>
              <p style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                {waveCount.claude_interpretation.summary}
              </p>
            </div>
          )}
        </motion.div>
      )}

      {/* Backtest */}
      {backtest && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '24px', marginBottom: '24px' }}
        >
          <h3 style={{ fontFamily: 'Cormorant Garamond', fontSize: '24px', fontWeight: 400, marginBottom: '20px', color: 'var(--text-primary)' }}>
            Historical Backtest
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Total Signals', value: backtest.total_signals },
              { label: 'Win Rate', value: `${backtest.win_rate_pct?.toFixed(1)}%`, good: backtest.win_rate_pct > 60 },
              { label: 'Avg Return', value: `+${backtest.avg_return_pct?.toFixed(1)}%`, good: backtest.avg_return_pct > 0 },
              { label: 'Avg Hold', value: `${Math.round(backtest.avg_hold_days / 30)}mo` },
              { label: 'vs S&P 500', value: `+${backtest.vs_spy_pct?.toFixed(1)}%`, good: backtest.vs_spy_pct > 0 },
            ].map(item => (
              <MetricCard key={item.label} label={item.label} value={item.value} highlight={item.good} />
            ))}
          </div>
          <p style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)' }}>
            Past performance does not guarantee future results.
          </p>
        </motion.div>
      )}

      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-dim)', padding: '20px 0', borderTop: '1px solid var(--border)' }}>
        Not financial advice. Educational tool only. Do your own research before investing.
      </div>
    </div>
  );
}
