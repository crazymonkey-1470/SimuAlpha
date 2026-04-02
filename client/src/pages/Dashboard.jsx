import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import ScoreRing from '../components/ScoreRing';
import SignalBadge from '../components/SignalBadge';
import TLILegend from '../components/TLILegend';

export default function Dashboard() {
  const [topResults, setTopResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchResults();
  }, []);

  async function fetchResults() {
    try {
      const res = await api.getResults();
      const loadTheBoat = (res.results || []).filter((r) => r.signal === 'LOAD THE BOAT');
      setTopResults(loadTheBoat.slice(0, 5));
    } catch {
      // Results might not exist yet
      setTopResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function runScan() {
    setScanning(true);
    setError(null);
    try {
      const res = await api.scan();
      const loadTheBoat = (res.results || []).filter((r) => r.signal === 'LOAD THE BOAT');
      setTopResults(loadTheBoat.slice(0, 5));
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 py-8"
    >
      {/* Hero */}
      <div className="text-center py-16">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-heading font-extrabold text-4xl sm:text-5xl mb-4"
        >
          <span className="text-accent">THE LONG</span> SCREENER
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-text-secondary font-mono text-sm max-w-xl mx-auto mb-8"
        >
          Buy fundamentally AND technically undervalued positions at or below the 200 WMA / 200 MMA.
          Elliott Wave timing. TLI methodology.
        </motion.p>
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onClick={runScan}
          disabled={scanning}
          className="px-6 py-3 bg-accent text-bg font-mono font-medium text-sm tracking-wider hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {scanning ? 'SCANNING 30 TICKERS...' : 'RUN TLI SCAN'}
        </motion.button>
      </div>

      {error && (
        <div className="mb-6 p-3 border border-red-500/30 bg-red-500/10 text-red-400 font-mono text-xs text-center">
          {error}
        </div>
      )}

      {/* Top Opportunities */}
      <div className="mb-8">
        <h2 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2">
          <span className="text-accent">TOP OPPORTUNITIES</span>
          <span className="text-xs text-text-secondary font-mono">LOAD THE BOAT</span>
        </h2>

        {loading ? (
          <div className="text-center py-12 text-text-secondary font-mono text-sm">
            Loading...
          </div>
        ) : topResults.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {topResults.map((result, i) => (
              <motion.div
                key={result.ticker}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <Link
                  to={`/ticker/${result.ticker}`}
                  className="block bg-bg-card border border-accent/20 p-4 hover:border-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-mono font-medium text-accent text-lg">{result.ticker}</div>
                      <div className="text-xs text-text-secondary truncate max-w-[120px]">
                        {result.company_name}
                      </div>
                    </div>
                    <ScoreRing score={result.total_score} size={48} strokeWidth={3} />
                  </div>
                  <div className="space-y-1 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Price</span>
                      <span>${result.current_price?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">vs 200WMA</span>
                      <span className="text-accent">{result.pct_from_200wma?.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Rev Growth</span>
                      <span>{result.revenue_growth_pct?.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="mt-3">
                    <SignalBadge signal={result.signal} />
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border border-border bg-bg-card">
            <div className="text-text-secondary font-mono text-sm mb-2">No data yet</div>
            <div className="text-xs text-text-secondary font-mono">
              Click "RUN TLI SCAN" to analyze 30 stocks
            </div>
          </div>
        )}
      </div>

      {/* Quick Links + Legend */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-bg-card border border-border p-4">
          <h3 className="font-heading font-semibold text-sm mb-3 text-text-secondary">QUICK ACTIONS</h3>
          <div className="space-y-2">
            <Link
              to="/screener"
              className="block px-3 py-2 text-xs font-mono text-accent hover:bg-bg-hover border border-border transition-colors"
            >
              VIEW FULL SCREENER →
            </Link>
            <Link
              to="/watchlist"
              className="block px-3 py-2 text-xs font-mono text-text-secondary hover:bg-bg-hover border border-border transition-colors"
            >
              MANAGE WATCHLIST →
            </Link>
          </div>
        </div>
        <TLILegend />
      </div>
    </motion.div>
  );
}
