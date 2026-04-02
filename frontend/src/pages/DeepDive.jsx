import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import ScoreRing from '../components/ScoreRing';
import SignalBadge from '../components/SignalBadge';
import MetricCard from '../components/MetricCard';

function fmt(val, decimals = 2) {
  if (val == null) return '—';
  return val.toFixed(decimals);
}

function fmtRevenue(val) {
  if (val == null) return '—';
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(0)}M`;
  return `$${val.toLocaleString()}`;
}

export default function DeepDive() {
  const { symbol } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [watchlistMsg, setWatchlistMsg] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.getTicker(symbol);
        setData(res.result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [symbol]);

  async function addToWatchlist() {
    try {
      await api.addToWatchlist(symbol);
      setWatchlistMsg('Added to watchlist');
      setTimeout(() => setWatchlistMsg(null), 3000);
    } catch {
      setWatchlistMsg('Failed to add');
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-center py-24 font-mono text-text-secondary text-sm">
          Analyzing {symbol?.toUpperCase()}...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-center py-24">
          <div className="font-mono text-red-400 text-sm mb-4">{error || 'No data found'}</div>
          <Link to="/screener" className="text-accent font-mono text-xs hover:underline">
            ← Back to Screener
          </Link>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 py-8"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <Link to="/screener" className="text-xs font-mono text-text-secondary hover:text-accent mb-2 inline-block">
            ← SCREENER
          </Link>
          <h1 className="font-heading font-bold text-3xl text-accent">{data.ticker}</h1>
          <div className="text-text-secondary font-mono text-sm">
            {data.company_name} {data.sector && `· ${data.sector}`}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <ScoreRing score={data.total_score || 0} size={90} strokeWidth={5} />
          <div className="text-right">
            <SignalBadge signal={data.signal || 'WATCH'} />
            <div className="mt-2 text-2xl font-mono font-medium">
              ${fmt(data.current_price)}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-8">
        <button
          onClick={addToWatchlist}
          className="px-4 py-2 border border-accent text-accent font-mono text-xs tracking-wider hover:bg-accent/10 transition-colors"
        >
          + ADD TO WATCHLIST
        </button>
        {watchlistMsg && (
          <span className="text-xs font-mono text-accent self-center">{watchlistMsg}</span>
        )}
      </div>

      {/* Score Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-bg-card border border-border p-5">
          <h3 className="font-heading font-semibold text-sm text-accent mb-4">FUNDAMENTAL SCORE</h3>
          <div className="text-3xl font-mono font-medium mb-4">{data.fundamental_score}<span className="text-text-secondary text-lg">/50</span></div>
          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-text-secondary">Revenue Growth</span>
              <span>{data.revenue_growth_pct != null ? `${fmt(data.revenue_growth_pct, 1)}%` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">P/E Ratio</span>
              <span>{fmt(data.pe_ratio, 1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">P/S Ratio</span>
              <span>{fmt(data.ps_ratio, 1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">% from 52w High</span>
              <span>{data.pct_from_52w_high != null ? `${fmt(data.pct_from_52w_high, 1)}%` : '—'}</span>
            </div>
          </div>
        </div>

        <div className="bg-bg-card border border-border p-5">
          <h3 className="font-heading font-semibold text-sm text-accent mb-4">TECHNICAL SCORE</h3>
          <div className="text-3xl font-mono font-medium mb-4">{data.technical_score}<span className="text-text-secondary text-lg">/50</span></div>
          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-text-secondary">200 WMA</span>
              <span>${fmt(data.price_200wma)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">% from 200 WMA</span>
              <span style={{ color: data.pct_from_200wma <= 0 ? '#00ff88' : '#f5a623' }}>
                {data.pct_from_200wma != null ? `${fmt(data.pct_from_200wma, 1)}%` : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">200 MMA</span>
              <span>${fmt(data.price_200mma)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">% from 200 MMA</span>
              <span style={{ color: data.pct_from_200mma <= 0 ? '#00ff88' : '#f5a623' }}>
                {data.pct_from_200mma != null ? `${fmt(data.pct_from_200mma, 1)}%` : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <h3 className="font-heading font-semibold text-sm text-text-secondary mb-3">KEY METRICS</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <MetricCard label="Current Price" value={`$${fmt(data.current_price)}`} />
        <MetricCard label="52w High" value={`$${fmt(data.week_52_high)}`} />
        <MetricCard label="Revenue (TTM)" value={fmtRevenue(data.revenue_current)} />
        <MetricCard label="Rev Prior Year" value={fmtRevenue(data.revenue_prior_year)} />
        <MetricCard label="P/E Ratio" value={fmt(data.pe_ratio, 1)} />
        <MetricCard label="P/S Ratio" value={fmt(data.ps_ratio, 1)} />
      </div>

      {/* TLI Wave Notes */}
      <div className="bg-bg-card border border-border p-5">
        <h3 className="font-heading font-semibold text-sm text-accent mb-3">TLI WAVE ANNOTATION</h3>
        <div className="text-xs font-mono text-text-secondary leading-relaxed">
          {data.signal === 'LOAD THE BOAT' ? (
            <p>
              Strong buy signal. Price is trading at or near the 200 WMA/MMA zone with solid fundamentals.
              This is the TLI sweet spot — historically, positions entered at these levels during corrective
              waves have delivered the highest risk-adjusted returns. Consider building a full position.
            </p>
          ) : data.signal === 'ACCUMULATE' ? (
            <p>
              Moderate opportunity. The stock shows either strong fundamentals or favorable technical positioning,
              but not both at peak levels. Consider dollar-cost averaging into a position. Monitor for further
              price weakness toward the 200 WMA for optimal entry.
            </p>
          ) : (
            <p>
              Watch zone. The stock does not currently meet TLI criteria for aggressive accumulation.
              Either fundamentals need improvement or price remains too far above key moving averages.
              Add to watchlist and monitor for changes in scoring.
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
