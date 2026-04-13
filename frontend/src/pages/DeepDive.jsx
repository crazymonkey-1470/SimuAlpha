import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTickerDetail } from '../hooks/useScreener';
import ScoreRing from '../components/ScoreRing';
import SignalBadge from '../components/SignalBadge';
import MetricCard from '../components/MetricCard';
import LoadingSpinner from '../components/LoadingSpinner';
import MADistanceBar from '../components/MADistanceBar';
import FibTargetLadder from '../components/FibTargetLadder';
import WavePositionIndicator from '../components/WavePositionIndicator';
import RevenueSparkline from '../components/RevenueSparkline';
import MarginTrend from '../components/MarginTrend';
import VolumeTrendBadge from '../components/VolumeTrendBadge';
import BacktestBadge from '../components/BacktestBadge';
import SectorStrength from '../components/SectorStrength';
import ValuationDisplay from '../components/ValuationDisplay';
import ThesisDisplay from '../components/ThesisDisplay';
import SAINConsensusPanel from '../components/sain/SAINConsensusPanel';
import PositionActionCard from '../components/PositionActionCard';
import supabase from '../supabaseClient';
import { useState, useEffect } from 'react';

export default function DeepDive() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const { result, waveCount, backtest, loading } = useTickerDetail(symbol);
  const [watchlisted, setWatchlisted] = useState(false);

  // Check if already on watchlist
  useEffect(() => {
    if (!symbol) return;
    supabase.from('watchlist').select('id').eq('ticker', symbol).maybeSingle()
      .then(({ data }) => { if (data) setWatchlisted(true); });
  }, [symbol]);

  async function addToWatchlist() {
    const { error } = await supabase.from('watchlist').insert({ ticker: symbol, notes: '' });
    if (!error) setWatchlisted(true);
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
            { label: 'Revenue Growth', value: result.revenue_growth_pct != null ? `${result.revenue_growth_pct.toFixed(1)}% YoY` : '\u2014', good: result.revenue_growth_pct > 10 },
            { label: 'From 52W High', value: result.pct_from_52w_high != null ? `${result.pct_from_52w_high.toFixed(1)}%` : '\u2014', good: result.pct_from_52w_high < -25 },
            { label: 'P/S Ratio', value: result.ps_ratio != null ? result.ps_ratio.toFixed(1) : '\u2014', good: result.ps_ratio < 5 },
            { label: 'P/E Ratio', value: result.pe_ratio != null ? result.pe_ratio.toFixed(1) : '\u2014', good: result.pe_ratio < 20 },
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
            { label: 'Current Price', value: result.current_price != null ? `$${result.current_price.toFixed(2)}` : '\u2014' },
            { label: '200 Weekly MA', value: result.price_200wma != null ? `$${result.price_200wma.toFixed(2)}` : '\u2014', good: result.pct_from_200wma <= 0 },
            { label: '200 Monthly MA', value: result.price_200mma != null ? `$${result.price_200mma.toFixed(2)}` : '\u2014', good: result.pct_from_200mma <= 0 },
            { label: '% from 200WMA', value: result.pct_from_200wma != null ? `${result.pct_from_200wma.toFixed(1)}%` : '\u2014', good: result.pct_from_200wma <= 0 },
            { label: '% from 200MMA', value: result.pct_from_200mma != null ? `${result.pct_from_200mma.toFixed(1)}%` : '\u2014', good: result.pct_from_200mma <= 0 },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-secondary)' }}>{item.label}</span>
              <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '12px', color: item.good ? 'var(--signal-green)' : 'var(--text-primary)' }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bull / Bear Line */}
      {result.bull_bear_line != null && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 }}
          style={{
            display: 'flex', gap: '24px', marginBottom: '32px', flexWrap: 'wrap'
          }}
        >
          <div style={{
            flex: 1, background: 'var(--signal-green-dim)', border: '1px solid var(--signal-green)30',
            borderRadius: '8px', padding: '14px 20px', minWidth: '200px'
          }}>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--signal-green)', letterSpacing: '0.1em', marginBottom: '4px' }}>BULL CASE</div>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '16px', color: 'var(--signal-green)', fontWeight: 600 }}>
              Above ${result.bull_bear_line.toFixed(2)}
            </div>
          </div>
          <div style={{
            flex: 1, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: '8px', padding: '14px 20px', minWidth: '200px'
          }}>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--red, #ef4444)', letterSpacing: '0.1em', marginBottom: '4px' }}>BEAR CASE</div>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '16px', color: 'var(--red, #ef4444)', fontWeight: 600 }}>
              Below ${result.bull_bear_line.toFixed(2)}
            </div>
          </div>
        </motion.div>
      )}

      {/* Technical Picture */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '24px', marginBottom: '32px' }}
      >
        <h3 style={{ fontFamily: 'Cormorant Garamond', fontSize: '24px', fontWeight: 400, marginBottom: '20px', color: 'var(--text-primary)' }}>
          Technical Picture
        </h3>
        <div style={{ marginBottom: '20px' }}>
          <MADistanceBar
            currentPrice={result.current_price}
            price200wma={result.price_200wma}
            price200mma={result.price_200mma}
            pctFrom200wma={result.pct_from_200wma}
            pctFrom200mma={result.pct_from_200mma}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {waveCount && (
            <div>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
                Wave Position
              </div>
              <WavePositionIndicator
                waveStructure={waveCount.wave_structure}
                currentWave={waveCount.current_wave}
                tliSignal={waveCount.tli_signal}
                waveConfidence={waveCount.confidence_label}
              />
            </div>
          )}
          {waveCount?.entry_zone_low != null && (
            <div>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
                Price Targets
              </div>
              <FibTargetLadder
                entryZoneLow={waveCount.entry_zone_low}
                entryZoneHigh={waveCount.entry_zone_high}
                stopLoss={waveCount.stop_loss}
                target1={waveCount.target_1}
                target2={waveCount.target_2}
                currentPrice={result.current_price}
                rewardRiskRatio={waveCount.reward_risk_ratio}
              />
            </div>
          )}
        </div>
      </motion.div>

      {/* Position Action Card + AI Investment Thesis */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '24px', marginBottom: '32px', alignItems: 'start' }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.16 }}>
          <PositionActionCard ticker={symbol} />
        </motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.17 }}>
          <ThesisDisplay ticker={symbol} />
        </motion.div>
      </div>

      {/* SAIN 4-Layer Consensus */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.175 }}
        style={{ marginBottom: '32px' }}
      >
        <SAINConsensusPanel ticker={symbol} />
      </motion.div>

      {/* Three-Pillar Valuation */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.18 }}
        style={{ marginBottom: '32px' }}
      >
        <ValuationDisplay ticker={symbol} currentPrice={result.current_price} />
      </motion.div>

      {/* Key metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '32px' }}>
        <MetricCard label="Revenue (Current)" value={result.revenue_current ? `$${(result.revenue_current / 1e9).toFixed(1)}B` : '\u2014'} />
        <MetricCard label="Revenue (Prior)" value={result.revenue_prior_year ? `$${(result.revenue_prior_year / 1e9).toFixed(1)}B` : '\u2014'} />
        <MetricCard label="Rev Growth" value={result.revenue_growth_pct != null ? `${result.revenue_growth_pct.toFixed(1)}%` : '\u2014'} highlight={result.revenue_growth_pct > 10} />
        <MetricCard label="52W High" value={result.week_52_high != null ? `$${result.week_52_high.toFixed(2)}` : '\u2014'} />
        <MetricCard label="From 52W High" value={result.pct_from_52w_high != null ? `${result.pct_from_52w_high.toFixed(1)}%` : '\u2014'} highlight={result.pct_from_52w_high < -25} />
        <MetricCard label="P/E Ratio" value={result.pe_ratio?.toFixed(1) ?? '\u2014'} />
        <MetricCard label="P/S Ratio" value={result.ps_ratio?.toFixed(1) ?? '\u2014'} />
      </div>

      {/* Fundamental Trend */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '24px', marginBottom: '32px' }}
      >
        <h3 style={{ fontFamily: 'Cormorant Garamond', fontSize: '24px', fontWeight: 400, marginBottom: '20px', color: 'var(--text-primary)' }}>
          Fundamental Trend
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px', alignItems: 'start' }}>
          <div>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
              Revenue History
            </div>
            <RevenueSparkline revenueHistory={result.revenue_history} cagr={(() => {
              const h = (result.revenue_history || []).filter(v => v != null);
              if (h.length < 2 || h[0] <= 0) return null;
              return (Math.pow(h[h.length - 1] / h[0], 1 / (h.length - 1)) - 1) * 100;
            })()} />
          </div>
          <div>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
              Gross Margin
            </div>
            <MarginTrend grossMarginHistory={result.gross_margin_history} grossMarginCurrent={result.gross_margin_current} />
          </div>
          <div>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
              Volume Trend
            </div>
            <VolumeTrendBadge volumeTrend={result.volume_trend} volumeTrendRatio={result.volume_trend_ratio} />
          </div>
        </div>
      </motion.div>

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
            background: ['WAVE_C_BOTTOM','WAVE_2_BOTTOM','WAVE_4_BOTTOM'].includes(waveCount.tli_signal) ? 'var(--signal-green-dim)' : ['WAVE_3_IN_PROGRESS','WAVE_5_IN_PROGRESS','WAVE_B_BOUNCE'].includes(waveCount.tli_signal) ? 'rgba(232, 68, 68, 0.08)' : 'var(--bg-secondary)',
            border: `1px solid ${['WAVE_C_BOTTOM','WAVE_2_BOTTOM','WAVE_4_BOTTOM'].includes(waveCount.tli_signal) ? 'var(--signal-green)30' : ['WAVE_3_IN_PROGRESS','WAVE_5_IN_PROGRESS','WAVE_B_BOUNCE'].includes(waveCount.tli_signal) ? 'rgba(232, 68, 68, 0.2)' : 'var(--border)'}`,
            borderRadius: '6px', marginBottom: '16px'
          }}>
            <div style={{
              fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 500, marginBottom: '4px',
              color: ['WAVE_C_BOTTOM','WAVE_2_BOTTOM','WAVE_4_BOTTOM'].includes(waveCount.tli_signal) ? 'var(--signal-green)' : ['WAVE_3_IN_PROGRESS','WAVE_5_IN_PROGRESS','WAVE_B_BOUNCE'].includes(waveCount.tli_signal) ? 'var(--red)' : 'var(--text-secondary)'
            }}>
              {waveCount.tli_signal}
            </div>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {waveCount.tli_signal_reason}
            </div>
          </div>

          {/* Fib levels */}
          {waveCount.entry_zone_low != null && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
              {[
                { label: 'Entry Zone', value: waveCount.entry_zone_low != null && waveCount.entry_zone_high != null ? `$${waveCount.entry_zone_low.toFixed(2)} \u2014 $${waveCount.entry_zone_high.toFixed(2)}` : '\u2014', color: 'var(--signal-green)' },
                { label: 'Stop Loss', value: waveCount.stop_loss != null ? `$${waveCount.stop_loss.toFixed(2)}` : '\u2014', color: 'var(--red)' },
                { label: 'Target 1', value: waveCount.target_1 != null ? `$${waveCount.target_1.toFixed(2)}` : '\u2014', color: 'var(--signal-amber)' },
                { label: 'Target 2', value: waveCount.target_2 != null ? `$${waveCount.target_2.toFixed(2)}` : '\u2014', color: 'var(--signal-green)' },
                { label: 'R/R Ratio', value: waveCount.reward_risk_ratio != null ? `${waveCount.reward_risk_ratio.toFixed(1)}x` : '\u2014', color: waveCount.reward_risk_ratio >= 2 ? 'var(--signal-green)' : 'var(--text-secondary)' },
              ].map(item => (
                <div key={item.label} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 12px' }}>
                  <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.label}</div>
                  <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '13px', color: item.color, fontWeight: 500 }}>{item.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Claude interpretation */}
          {waveCount.claude_interpretation && typeof waveCount.claude_interpretation === 'object' && !waveCount.claude_interpretation.error && (
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

      {/* Historical Performance */}
      {(backtest || (result.sector && result.sector_avg_score != null)) && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '24px', marginBottom: '24px' }}
        >
          <h3 style={{ fontFamily: 'Cormorant Garamond', fontSize: '24px', fontWeight: 400, marginBottom: '20px', color: 'var(--text-primary)' }}>
            Historical Performance
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
            {/* Left: Backtest */}
            <div>
              {backtest ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                    {[
                      { label: 'Total Signals', value: backtest.total_signals ?? '\u2014' },
                      { label: 'Win Rate', value: backtest.win_rate_pct != null ? `${backtest.win_rate_pct.toFixed(1)}%` : '\u2014', good: backtest.win_rate_pct > 60 },
                      { label: 'Avg Return', value: backtest.avg_return_pct != null ? `${backtest.avg_return_pct > 0 ? '+' : ''}${backtest.avg_return_pct.toFixed(1)}%` : '\u2014', good: backtest.avg_return_pct > 0 },
                      { label: 'Avg Hold', value: backtest.avg_hold_days != null ? `${Math.round(backtest.avg_hold_days / 30)}mo` : '\u2014' },
                      { label: 'vs S&P 500', value: backtest.vs_spy_pct != null ? `${backtest.vs_spy_pct > 0 ? '+' : ''}${backtest.vs_spy_pct.toFixed(1)}%` : '\u2014', good: backtest.vs_spy_pct > 0 },
                    ].map(item => (
                      <MetricCard key={item.label} label={item.label} value={item.value} highlight={item.good} />
                    ))}
                  </div>
                  <p style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)' }}>
                    Past performance does not guarantee future results.
                  </p>
                </>
              ) : (
                <BacktestBadge backtest={null} />
              )}
            </div>
            {/* Right: Sector Strength */}
            <div>
              {result.sector && result.sector_avg_score != null ? (
                <SectorStrength
                  sector={result.sector}
                  totalScore={result.total_score}
                  sectorAvgScore={result.sector_avg_score}
                  sectorRank={result.sector_rank}
                />
              ) : (
                <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)' }}>
                  Sector data unavailable
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-dim)', padding: '20px 0', borderTop: '1px solid var(--border)' }}>
        Not financial advice. Educational tool only. Do your own research before investing.
      </div>
    </div>
  );
}
