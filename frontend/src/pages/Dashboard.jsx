import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import supabase from '../supabaseClient';
import ScoreRing from '../components/ScoreRing';
import SignalBadge from '../components/SignalBadge';
import AlertFeed from '../components/AlertFeed';

export default function Dashboard() {
  const [top5, setTop5] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [pipeline, setPipeline] = useState({ universe: 0, candidates: 0, scored: 0, lastScan: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [
        { data: topData },
        { data: alertData },
        { count: uniCount },
        { count: candCount },
        { count: resCount },
        { data: histData },
      ] = await Promise.all([
        supabase.from('screener_results').select('*').eq('signal', 'LOAD THE BOAT').order('total_score', { ascending: false }).limit(5),
        supabase.from('signal_alerts').select('*').order('fired_at', { ascending: false }).limit(10),
        supabase.from('universe').select('*', { count: 'exact', head: true }),
        supabase.from('screener_candidates').select('*', { count: 'exact', head: true }),
        supabase.from('screener_results').select('*', { count: 'exact', head: true }),
        supabase.from('scan_history').select('scanned_at').order('scanned_at', { ascending: false }).limit(1),
      ]);
      setTop5(topData || []);
      setAlerts(alertData || []);
      setPipeline({
        universe: uniCount || 0,
        candidates: candCount || 0,
        scored: resCount || 0,
        lastScan: histData?.[0]?.scanned_at || null,
      });
      setLoading(false);
    }
    load();
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

      {/* Hero */}
      <div className="relative text-center py-16 sm:py-24 overflow-hidden">
        <div className="scanline" />
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="font-heading font-extrabold text-4xl sm:text-5xl lg:text-6xl mb-4">
          <span className="text-green">THE LONG</span> SCREENER
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="text-text-secondary font-mono text-[11px] sm:text-xs max-w-lg mx-auto">
          The market always gives you the opportunity. The question is whether you're watching.
        </motion.p>
      </div>

      {/* Pipeline Status */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
        className="flex flex-wrap items-center justify-center gap-2 mb-10 text-[10px] font-mono text-text-secondary">
        <span>Universe <span className="text-text-primary">{pipeline.universe.toLocaleString()}</span></span>
        <span className="text-text-dim">→</span>
        <span>Candidates <span className="text-amber">{pipeline.candidates.toLocaleString()}</span></span>
        <span className="text-text-dim">→</span>
        <span>Scored <span className="text-green">{pipeline.scored}</span></span>
        {pipeline.lastScan && (
          <>
            <span className="text-text-dim">|</span>
            <span>Last scan: {new Date(pipeline.lastScan).toLocaleString()}</span>
          </>
        )}
      </motion.div>

      {loading ? (
        <div className="text-center py-16 font-mono text-text-secondary text-xs">Loading...</div>
      ) : pipeline.scored === 0 ? (
        <div className="text-center py-16 border border-border bg-bg-card">
          <div className="font-mono text-text-secondary text-sm mb-2">Pipeline initializing</div>
          <div className="font-mono text-text-secondary text-[11px]">First scan running. Check back in 10 minutes.</div>
        </div>
      ) : (
        <>
          {/* Top 5 */}
          {top5.length > 0 && (
            <div className="mb-10">
              <h2 className="font-heading font-semibold text-sm mb-4 text-center text-green">TOP OPPORTUNITIES</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                {top5.map((r, i) => (
                  <motion.div key={r.ticker} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.08 }}>
                    <Link to={`/ticker/${r.ticker}`}
                      className="block bg-bg-card border border-green/20 p-4 hover:border-green/50 transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-mono font-medium text-green text-lg">{r.ticker}</div>
                          <div className="text-[9px] text-text-secondary truncate max-w-[100px]">{r.company_name}</div>
                        </div>
                        <ScoreRing score={r.total_score} size={44} strokeWidth={3} />
                      </div>
                      <div className="space-y-1 text-[10px] font-mono mb-2">
                        <div className="flex justify-between"><span className="text-text-secondary">Price</span><span>${Number(r.current_price).toFixed(2)}</span></div>
                        <div className="flex justify-between"><span className="text-text-secondary">vs 200WMA</span><span className="text-green">{r.pct_from_200wma}%</span></div>
                        <div className="flex justify-between"><span className="text-text-secondary">vs 200MMA</span><span className="text-green">{r.pct_from_200mma}%</span></div>
                      </div>
                      <div className="flex items-center gap-2">
                        <SignalBadge signal={r.signal} compact />
                        {r.entry_zone && <span className="text-[8px] text-green font-mono">ENTRY</span>}
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Alerts */}
          <div className="mb-10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading font-semibold text-sm text-text-primary">RECENT ALERTS</h2>
              <Link to="/signals" className="text-[10px] font-mono text-green hover:underline">VIEW ALL →</Link>
            </div>
            <AlertFeed alerts={alerts} limit={10} />
          </div>

          {/* CTA */}
          <div className="text-center">
            <Link to="/screener"
              className="inline-block px-6 py-3 bg-green text-bg font-mono font-medium text-xs tracking-wider hover:bg-green/90 transition-colors">
              VIEW FULL SCREENER →
            </Link>
          </div>
        </>
      )}
    </motion.div>
  );
}
