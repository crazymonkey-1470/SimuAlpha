import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import supabase from '../supabaseClient';
import ScoreRing from '../components/ScoreRing';
import SignalBadge from '../components/SignalBadge';
import MetricCard from '../components/MetricCard';

function fmt(val, dec = 2) {
  if (val == null) return '—';
  return Number(val).toFixed(dec);
}

function fmtRev(val) {
  if (val == null) return '—';
  const n = Number(val);
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

function ScoreLine({ label, value, points, max }) {
  return (
    <div className="flex items-center justify-between text-xs font-mono py-1.5 border-b border-border/30">
      <span className="text-text-secondary">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-text-primary">{value}</span>
        <span className="text-green w-16 text-right">{points}/{max} pts</span>
      </div>
    </div>
  );
}

export default function DeepDive() {
  const { symbol } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [watchlistMsg, setWatchlistMsg] = useState(null);

  useEffect(() => {
    async function load() {
      const { data: row } = await supabase
        .from('screener_results')
        .select('*')
        .eq('ticker', symbol.toUpperCase())
        .single();
      setData(row);
      setLoading(false);
    }
    load();
  }, [symbol]);

  async function addToWatchlist() {
    const { error } = await supabase
      .from('watchlist')
      .upsert({ ticker: symbol.toUpperCase() }, { onConflict: 'ticker' });
    setWatchlistMsg(error ? 'Failed to add' : 'Added to watchlist');
    setTimeout(() => setWatchlistMsg(null), 3000);
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 text-center py-24 font-mono text-text-secondary text-sm">
        Loading {symbol?.toUpperCase()}...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 text-center py-24">
        <div className="font-mono text-text-secondary text-sm mb-4">
          {symbol?.toUpperCase()} not yet scanned.
        </div>
        <div className="font-mono text-text-secondary text-xs mb-4">
          First scan in progress. Check back in a few minutes.
        </div>
        <Link to="/screener" className="text-green font-mono text-xs hover:underline">← Back to Screener</Link>
      </div>
    );
  }

  // Reconstruct scoring breakdown
  const revGrowth = data.revenue_growth_pct;
  const revPts = revGrowth >= 15 ? 15 : revGrowth >= 8 ? 10 : revGrowth > 0 ? 5 : 0;
  const pct52 = Math.abs(data.pct_from_52w_high || 0);
  const pct52Pts = pct52 >= 50 ? 15 : pct52 >= 30 ? 10 : pct52 >= 15 ? 5 : 0;
  const ps = data.ps_ratio;
  const psPts = (ps != null && ps > 0) ? (ps < 2 ? 10 : ps < 5 ? 5 : 0) : 0;
  const pe = data.pe_ratio;
  const pePts = (pe != null && pe > 0) ? (pe < 15 ? 10 : pe < 20 ? 5 : 0) : 0;
  const wma = data.pct_from_200wma;
  const wmaPts = wma != null ? (wma <= 0 ? 25 : wma <= 5 ? 15 : wma <= 15 ? 5 : 0) : 0;
  const mma = data.pct_from_200mma;
  const mmaPts = mma != null ? (mma <= 0 ? 25 : mma <= 5 ? 15 : mma <= 10 ? 5 : 0) : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 py-8"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <Link to="/screener" className="text-[10px] font-mono text-text-secondary hover:text-green mb-1 inline-block">
            ← SCREENER
          </Link>
          <h1 className="font-heading font-bold text-3xl text-green">{data.ticker}</h1>
          <div className="text-text-secondary font-mono text-sm">
            {data.company_name}{data.sector && ` · ${data.sector}`}
          </div>
        </div>
        <div className="flex items-center gap-5">
          <ScoreRing score={data.total_score || 0} size={100} strokeWidth={6} />
          <div>
            <SignalBadge signal={data.signal || 'WATCH'} />
            <div className="mt-2 text-2xl font-mono font-medium">${fmt(data.current_price)}</div>
          </div>
        </div>
      </div>

      {/* Watchlist */}
      <div className="flex gap-3 mb-8">
        <button
          onClick={addToWatchlist}
          className="px-4 py-2 border border-green text-green font-mono text-[11px] tracking-wider hover:bg-green/10 transition-colors"
        >
          + ADD TO WATCHLIST
        </button>
        {watchlistMsg && <span className="text-xs font-mono text-green self-center">{watchlistMsg}</span>}
      </div>

      {/* Score Breakdown — two columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-bg-card border border-border p-5">
          <h3 className="font-heading font-semibold text-sm text-green mb-1">FUNDAMENTAL SCORE</h3>
          <div className="text-2xl font-mono font-medium mb-4">
            {data.fundamental_score}<span className="text-text-secondary text-base">/50</span>
          </div>
          <ScoreLine label="Revenue Growth YoY" value={revGrowth != null ? `${fmt(revGrowth, 1)}%` : '—'} points={revPts} max={15} />
          <ScoreLine label="% from 52w High" value={data.pct_from_52w_high != null ? `${fmt(data.pct_from_52w_high, 1)}%` : '—'} points={pct52Pts} max={15} />
          <ScoreLine label="P/S Ratio" value={ps != null ? fmt(ps, 1) : '—'} points={psPts} max={10} />
          <ScoreLine label="P/E Ratio" value={pe != null ? fmt(pe, 1) : '—'} points={pePts} max={10} />
        </div>

        <div className="bg-bg-card border border-border p-5">
          <h3 className="font-heading font-semibold text-sm text-green mb-1">TECHNICAL SCORE</h3>
          <div className="text-2xl font-mono font-medium mb-4">
            {data.technical_score}<span className="text-text-secondary text-base">/50</span>
          </div>
          <ScoreLine label="Price vs 200 WMA" value={wma != null ? `${fmt(wma, 1)}% (MA: $${fmt(data.price_200wma)})` : '—'} points={wmaPts} max={25} />
          <ScoreLine label="Price vs 200 MMA" value={mma != null ? `${fmt(mma, 1)}% (MA: $${fmt(data.price_200mma)})` : '—'} points={mmaPts} max={25} />
        </div>
      </div>

      {/* Key Metrics Grid */}
      <h3 className="font-heading font-semibold text-xs text-text-secondary mb-3 uppercase tracking-wider">Key Metrics</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-8">
        <MetricCard label="Current Price" value={`$${fmt(data.current_price)}`} />
        <MetricCard label="200 WMA" value={data.price_200wma != null ? `$${fmt(data.price_200wma)}` : null} />
        <MetricCard label="200 MMA" value={data.price_200mma != null ? `$${fmt(data.price_200mma)}` : null} />
        <MetricCard label="% from 200WMA" value={data.pct_from_200wma != null ? `${fmt(data.pct_from_200wma, 1)}%` : null} delta={data.pct_from_200wma} />
        <MetricCard label="% from 200MMA" value={data.pct_from_200mma != null ? `${fmt(data.pct_from_200mma, 1)}%` : null} delta={data.pct_from_200mma} />
        <MetricCard label="Revenue (Current)" value={fmtRev(data.revenue_current)} />
        <MetricCard label="Revenue (Prior)" value={fmtRev(data.revenue_prior_year)} />
        <MetricCard label="Revenue Growth" value={data.revenue_growth_pct != null ? `${fmt(data.revenue_growth_pct, 1)}%` : null} delta={data.revenue_growth_pct} />
        <MetricCard label="P/E Ratio" value={data.pe_ratio != null ? fmt(data.pe_ratio, 1) : null} />
        <MetricCard label="P/S Ratio" value={data.ps_ratio != null ? fmt(data.ps_ratio, 1) : null} />
        <MetricCard label="52-Week High" value={data.week_52_high != null ? `$${fmt(data.week_52_high)}` : null} />
        <MetricCard label="% from 52w High" value={data.pct_from_52w_high != null ? `${fmt(data.pct_from_52w_high, 1)}%` : null} delta={data.pct_from_52w_high} />
      </div>

      {/* TLI Note */}
      <div className="bg-bg-card border border-border p-5">
        <h3 className="font-heading font-semibold text-xs text-green mb-2">TLI METHODOLOGY NOTE</h3>
        <p className="text-xs font-mono text-text-secondary leading-relaxed">
          Per TLI strategy: scores &ge;75 represent the fundamental + technical sweet spot.
          Price at or below 200WMA/MMA with growing revenue = historically asymmetric risk/reward.
          This is a long-only methodology focused on accumulating high-conviction positions during
          periods of maximum pessimism, when both price and sentiment have mean-reverted to extremes.
        </p>
      </div>
    </motion.div>
  );
}
