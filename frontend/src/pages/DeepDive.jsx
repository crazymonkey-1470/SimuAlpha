import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import supabase from '../supabaseClient';
import ScoreRing from '../components/ScoreRing';
import SignalBadge from '../components/SignalBadge';
import MetricCard from '../components/MetricCard';
import AlertFeed from '../components/AlertFeed';
import WaveChart from '../components/WaveChart';
import FibTargets from '../components/FibTargets';
import BacktestCard from '../components/BacktestCard';

function f(v, d = 2) { return v == null ? '—' : Number(v).toFixed(d); }
function fRev(v) { if (v == null) return '—'; const n = Number(v); return n >= 1e9 ? `$${(n/1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n/1e6).toFixed(0)}M` : `$${n.toLocaleString()}`; }

function ScoreLine({ label, value, pts, max }) {
  return (
    <div className="flex items-center justify-between text-[11px] font-mono py-1.5 border-b border-border/20">
      <span className="text-text-secondary">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-text-primary">{value}</span>
        <span className="text-green w-14 text-right">{pts}/{max}</span>
      </div>
    </div>
  );
}

export default function DeepDive() {
  const { symbol } = useParams();
  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [waveCounts, setWaveCounts] = useState([]);
  const [backtestSummary, setBacktestSummary] = useState(null);
  const [backtestSignals, setBacktestSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wlMsg, setWlMsg] = useState(null);

  useEffect(() => {
    async function load() {
      const ticker = symbol.toUpperCase();
      const [{ data: row }, { data: alertRows }, { data: waveRows }, { data: btSummary }, { data: btSignals }] = await Promise.all([
        supabase.from('screener_results').select('*').eq('ticker', ticker).single(),
        supabase.from('signal_alerts').select('*').eq('ticker', ticker).order('fired_at', { ascending: false }).limit(5),
        supabase.from('wave_counts').select('*').eq('ticker', ticker).order('confidence_score', { ascending: false }),
        supabase.from('backtest_summary').select('*').eq('ticker', ticker).single(),
        supabase.from('backtest_results').select('*').eq('ticker', ticker).order('signal_date', { ascending: false }),
      ]);
      setData(row);
      setAlerts(alertRows || []);
      setWaveCounts(waveRows || []);
      setBacktestSummary(btSummary);
      setBacktestSignals(btSignals || []);
      setLoading(false);
    }
    load();
  }, [symbol]);

  async function addWl() {
    const { error } = await supabase.from('watchlist').upsert({ ticker: symbol.toUpperCase() }, { onConflict: 'ticker' });
    setWlMsg(error ? 'Failed' : 'Added!');
    setTimeout(() => setWlMsg(null), 3000);
  }

  if (loading) return <div className="max-w-7xl mx-auto px-4 py-8 text-center py-24 font-mono text-text-secondary text-xs">Analyzing {symbol?.toUpperCase()}...</div>;
  if (!data) return (
    <div className="max-w-7xl mx-auto px-4 py-8 text-center py-24">
      <div className="font-mono text-text-secondary text-sm mb-2">{symbol?.toUpperCase()} not yet in candidate pool.</div>
      <div className="font-mono text-text-secondary text-[11px] mb-4">Pipeline initializing — first scan running. Check back in 10 minutes.</div>
      <Link to="/screener" className="text-green font-mono text-xs hover:underline">← Screener</Link>
    </div>
  );

  // Reconstruct scoring
  const rg = data.revenue_growth_pct;
  const rgPts = rg >= 20 ? 15 : rg >= 10 ? 10 : rg > 0 ? 5 : 0;
  const d52 = Math.abs(data.pct_from_52w_high || 0);
  const d52Pts = d52 >= 60 ? 15 : d52 >= 40 ? 12 : d52 >= 25 ? 8 : d52 >= 15 ? 4 : 0;
  const ps = data.ps_ratio;
  const psPts = (ps != null && ps > 0) ? (ps < 1 ? 10 : ps < 3 ? 7 : ps < 5 ? 4 : ps < 10 ? 2 : 0) : 0;
  const pe = data.pe_ratio;
  const pePts = (pe != null && pe > 0) ? (pe < 10 ? 10 : pe < 15 ? 7 : pe < 20 ? 4 : pe < 30 ? 2 : 0) : 0;
  const wma = data.pct_from_200wma;
  const wmaPts = wma != null ? (wma <= 0 ? 25 : wma <= 3 ? 20 : wma <= 8 ? 12 : wma <= 15 ? 5 : 0) : 0;
  const mma = data.pct_from_200mma;
  const mmaPts = mma != null ? (mma <= 0 ? 25 : mma <= 3 ? 20 : mma <= 8 ? 12 : mma <= 15 ? 5 : 0) : 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <Link to="/screener" className="text-[9px] font-mono text-text-secondary hover:text-green mb-1 inline-block">← SCREENER</Link>
          <h1 className="font-heading font-bold text-3xl text-green">{data.ticker}</h1>
          <div className="text-text-secondary font-mono text-xs">{data.company_name}{data.sector && ` · ${data.sector}`}</div>
        </div>
        <div className="flex items-center gap-4">
          <ScoreRing score={data.total_score || 0} size={100} strokeWidth={6} />
          <div>
            <SignalBadge signal={data.signal || 'WATCH'} />
            <div className="mt-2 text-2xl font-mono font-medium">${f(data.current_price)}</div>
            {data.previous_score != null && data.previous_score !== data.total_score && (
              <div className="text-[9px] font-mono text-text-secondary">prev: {data.previous_score}</div>
            )}
          </div>
        </div>
      </div>

      {/* Entry Zone Panel */}
      <div className={`mb-6 p-4 border ${data.entry_zone ? 'border-green/40 bg-green-dim' : 'border-border bg-bg-card'}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm">{data.entry_zone ? '📍' : '⏳'}</span>
          <span className={`font-heading font-semibold text-xs ${data.entry_zone ? 'text-green' : 'text-text-secondary'}`}>
            {data.entry_zone ? 'ENTRY ZONE ACTIVE' : 'WAITING FOR ENTRY'}
          </span>
        </div>
        <p className="text-[11px] font-mono text-text-secondary">{data.entry_note || '—'}</p>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-6">
        <button onClick={addWl} className="px-3 py-1.5 border border-green text-green font-mono text-[10px] tracking-wider hover:bg-green-dim transition-colors">+ WATCHLIST</button>
        {wlMsg && <span className="text-[10px] font-mono text-green self-center">{wlMsg}</span>}
      </div>

      {/* Score Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-bg-card border border-border p-4">
          <h3 className="font-heading font-semibold text-xs text-green mb-1">FUNDAMENTAL SCORE</h3>
          <div className="text-xl font-mono font-medium mb-3">{data.fundamental_score}<span className="text-text-secondary text-sm">/50</span></div>
          <ScoreLine label="Revenue Growth" value={rg != null ? `${f(rg,1)}%` : '—'} pts={rgPts} max={15} />
          <ScoreLine label="52w Drawdown" value={data.pct_from_52w_high != null ? `${f(data.pct_from_52w_high,1)}%` : '—'} pts={d52Pts} max={15} />
          <ScoreLine label="P/S Ratio" value={ps != null ? f(ps,1) : '—'} pts={psPts} max={10} />
          <ScoreLine label="P/E Ratio" value={pe != null ? f(pe,1) : '—'} pts={pePts} max={10} />
        </div>
        <div className="bg-bg-card border border-border p-4">
          <h3 className="font-heading font-semibold text-xs text-green mb-1">TECHNICAL SCORE</h3>
          <div className="text-xl font-mono font-medium mb-3">{data.technical_score}<span className="text-text-secondary text-sm">/50</span></div>
          <ScoreLine label="vs 200 WMA" value={wma != null ? `${f(wma,1)}% (MA: $${f(data.price_200wma)})` : '—'} pts={wmaPts} max={25} />
          <ScoreLine label="vs 200 MMA" value={mma != null ? `${f(mma,1)}% (MA: $${f(data.price_200mma)})` : '—'} pts={mmaPts} max={25} />
        </div>
      </div>

      {/* Key Metrics */}
      <h3 className="font-heading font-semibold text-[10px] text-text-secondary mb-2 uppercase tracking-wider">Key Metrics</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 mb-6">
        <MetricCard label="Price" value={`$${f(data.current_price)}`} />
        <MetricCard label="200 WMA" value={data.price_200wma != null ? `$${f(data.price_200wma)}` : null} />
        <MetricCard label="200 MMA" value={data.price_200mma != null ? `$${f(data.price_200mma)}` : null} />
        <MetricCard label="% from WMA" value={data.pct_from_200wma != null ? `${f(data.pct_from_200wma,1)}%` : null} delta={data.pct_from_200wma} />
        <MetricCard label="% from MMA" value={data.pct_from_200mma != null ? `${f(data.pct_from_200mma,1)}%` : null} delta={data.pct_from_200mma} />
        <MetricCard label="Revenue" value={fRev(data.revenue_current)} />
        <MetricCard label="Rev Prior" value={fRev(data.revenue_prior_year)} />
        <MetricCard label="Rev Growth" value={data.revenue_growth_pct != null ? `${f(data.revenue_growth_pct,1)}%` : null} delta={data.revenue_growth_pct} />
        <MetricCard label="P/E" value={data.pe_ratio != null ? f(data.pe_ratio,1) : null} />
        <MetricCard label="P/S" value={data.ps_ratio != null ? f(data.ps_ratio,1) : null} />
        <MetricCard label="52w High" value={data.week_52_high != null ? `$${f(data.week_52_high)}` : null} />
        <MetricCard label="% from 52w" value={data.pct_from_52w_high != null ? `${f(data.pct_from_52w_high,1)}%` : null} delta={data.pct_from_52w_high} />
      </div>

      {/* Wave Analysis Section */}
      {waveCounts.length > 0 && (
        <div className="mb-6">
          <h3 className="font-heading font-semibold text-[10px] text-text-secondary mb-2 uppercase tracking-wider">Wave Analysis</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <WaveChart waveCounts={waveCounts} />
            <FibTargets waveCount={waveCounts[0]} currentPrice={data.current_price} />
          </div>
        </div>
      )}

      {/* Backtest Performance */}
      {(backtestSummary || backtestSignals.length > 0) && (
        <div className="mb-6">
          <h3 className="font-heading font-semibold text-[10px] text-text-secondary mb-2 uppercase tracking-wider">Backtest Performance</h3>
          <BacktestCard summary={backtestSummary} signals={backtestSignals} />
        </div>
      )}

      {/* TLI Note */}
      <div className="bg-bg-card border border-border p-4 mb-6">
        <h3 className="font-heading font-semibold text-[10px] text-green mb-2">TLI METHODOLOGY NOTE</h3>
        <p className="text-[11px] font-mono text-text-secondary leading-relaxed">
          Per TLI strategy: scores &ge;75 represent the fundamental + technical sweet spot.
          Price at or below 200WMA/MMA with growing revenue = historically asymmetric risk/reward.
          This is a long-only methodology — accumulate during corrective waves at key moving average supports.
        </p>
      </div>

      {/* Alert History */}
      {alerts.length > 0 && (
        <div>
          <h3 className="font-heading font-semibold text-[10px] text-text-secondary mb-2 uppercase tracking-wider">Alert History</h3>
          <AlertFeed alerts={alerts} limit={5} />
        </div>
      )}
    </motion.div>
  );
}
