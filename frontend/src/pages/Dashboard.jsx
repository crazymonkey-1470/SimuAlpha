import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import supabase from '../supabaseClient';
import ScoreRing from '../components/ScoreRing';
import SignalBadge from '../components/SignalBadge';

export default function Dashboard() {
  const [results, setResults] = useState([]);
  const [scanInfo, setScanInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: screener }, { data: history }] = await Promise.all([
        supabase
          .from('screener_results')
          .select('*')
          .order('total_score', { ascending: false }),
        supabase
          .from('scan_history')
          .select('*')
          .order('scanned_at', { ascending: false })
          .limit(1),
      ]);
      setResults(screener || []);
      setScanInfo(history?.[0] || null);
      setLoading(false);
    }
    load();
  }, []);

  const loadTheBoat = results.filter((r) => r.signal === 'LOAD THE BOAT');
  const accumulate = results.filter((r) => r.signal === 'ACCUMULATE');
  const watch = results.filter((r) => r.signal === 'WATCH');
  const top3 = loadTheBoat.slice(0, 3);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 py-8"
    >
      {/* Hero */}
      <div className="relative text-center py-20 overflow-hidden">
        <div className="scanline" />
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-heading font-extrabold text-4xl sm:text-5xl lg:text-6xl mb-4"
        >
          <span className="text-green">THE LONG</span> SCREENER
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-text-secondary font-mono text-xs sm:text-sm max-w-lg mx-auto mb-6"
        >
          Fundamentally undervalued. Technically confirmed. No noise.
        </motion.p>
        {scanInfo && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-[10px] font-mono text-text-secondary"
          >
            Last scan: {new Date(scanInfo.scanned_at).toLocaleString()}
          </motion.p>
        )}
      </div>

      {loading ? (
        <div className="text-center py-16 font-mono text-text-secondary text-sm">Loading...</div>
      ) : results.length === 0 ? (
        <div className="text-center py-16 border border-border bg-bg-card">
          <div className="font-mono text-text-secondary text-sm mb-2">First scan in progress.</div>
          <div className="font-mono text-text-secondary text-xs">Check back in a few minutes.</div>
        </div>
      ) : (
        <>
          {/* Summary Bar */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-wrap gap-4 justify-center mb-10 text-xs font-mono"
          >
            <span className="text-text-secondary">{results.length} stocks scanned</span>
            <span className="text-text-secondary">|</span>
            <span className="text-green">{loadTheBoat.length} LOAD THE BOAT</span>
            <span className="text-text-secondary">|</span>
            <span className="text-amber">{accumulate.length} ACCUMULATE</span>
            <span className="text-text-secondary">|</span>
            <span className="text-text-secondary">{watch.length} WATCH</span>
          </motion.div>

          {/* Top 3 LOAD THE BOAT */}
          {top3.length > 0 && (
            <div className="mb-10">
              <h2 className="font-heading font-semibold text-base mb-4 text-center">
                <span className="text-green">TOP OPPORTUNITIES</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
                {top3.map((r, i) => (
                  <motion.div
                    key={r.ticker}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                  >
                    <Link
                      to={`/ticker/${r.ticker}`}
                      className="block bg-bg-card border border-green/20 p-5 hover:border-green/50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="font-mono font-medium text-green text-xl">{r.ticker}</div>
                          <div className="text-[10px] text-text-secondary truncate max-w-[140px]">{r.company_name}</div>
                        </div>
                        <ScoreRing score={r.total_score} size={52} strokeWidth={3} />
                      </div>
                      <div className="space-y-1.5 text-[11px] font-mono mb-3">
                        <div className="flex justify-between">
                          <span className="text-text-secondary">Price</span>
                          <span>${Number(r.current_price).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-secondary">vs 200WMA</span>
                          <span className="text-green">{r.pct_from_200wma != null ? `${r.pct_from_200wma}%` : '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-secondary">Rev Growth</span>
                          <span>{r.revenue_growth_pct != null ? `${r.revenue_growth_pct}%` : '—'}</span>
                        </div>
                      </div>
                      <SignalBadge signal={r.signal} />
                    </Link>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="text-center">
            <Link
              to="/screener"
              className="inline-block px-6 py-3 bg-green text-bg font-mono font-medium text-sm tracking-wider hover:bg-green/90 transition-colors"
            >
              VIEW FULL SCREENER →
            </Link>
          </div>
        </>
      )}
    </motion.div>
  );
}
