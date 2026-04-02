import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import SignalBadge from '../components/SignalBadge';
import ScoreRing from '../components/ScoreRing';

export default function Watchlist() {
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ticker, setTicker] = useState('');
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchWatchlist();
  }, []);

  async function fetchWatchlist() {
    try {
      const res = await api.getWatchlist();
      setWatchlist(res.watchlist || []);
    } catch {
      setWatchlist([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!ticker.trim()) return;
    setAdding(true);
    try {
      await api.addToWatchlist(ticker.trim(), notes.trim() || undefined);
      setTicker('');
      setNotes('');
      await fetchWatchlist();
    } catch (err) {
      console.error('Add failed:', err);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(t) {
    try {
      await api.removeFromWatchlist(t);
      setWatchlist((prev) => prev.filter((w) => w.ticker !== t));
    } catch (err) {
      console.error('Remove failed:', err);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 py-8"
    >
      <h1 className="font-heading font-bold text-2xl mb-6">
        <span className="text-accent">MY</span> WATCHLIST
      </h1>

      {/* Add form */}
      <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3 mb-8">
        <input
          type="text"
          placeholder="Ticker (e.g. AAPL)"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          className="px-3 py-2 bg-bg-card border border-border text-sm font-mono text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent w-32"
        />
        <input
          type="text"
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="flex-1 px-3 py-2 bg-bg-card border border-border text-sm font-mono text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={adding || !ticker.trim()}
          className="px-4 py-2 bg-accent text-bg font-mono text-xs font-medium tracking-wider hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {adding ? 'ADDING...' : '+ ADD'}
        </button>
      </form>

      {/* Watchlist */}
      {loading ? (
        <div className="text-center py-12 text-text-secondary font-mono text-sm">Loading...</div>
      ) : watchlist.length === 0 ? (
        <div className="text-center py-16 border border-border bg-bg-card">
          <div className="text-text-secondary font-mono text-sm mb-2">Watchlist is empty</div>
          <div className="text-xs text-text-secondary font-mono">
            Add tickers above or use the "Add to Watchlist" button on any stock page
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {watchlist.map((item, i) => {
            const score = item.score_data;
            return (
              <motion.div
                key={item.ticker}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between bg-bg-card border border-border p-4 hover:border-border/80 transition-colors"
              >
                <div className="flex items-center gap-4">
                  {score && <ScoreRing score={score.total_score || 0} size={44} strokeWidth={3} />}
                  <div>
                    <Link
                      to={`/ticker/${item.ticker}`}
                      className="font-mono font-medium text-accent hover:underline"
                    >
                      {item.ticker}
                    </Link>
                    {score?.company_name && (
                      <div className="text-xs text-text-secondary">{score.company_name}</div>
                    )}
                    {item.notes && (
                      <div className="text-xs text-text-secondary/70 mt-0.5 italic">{item.notes}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {score && (
                    <>
                      <div className="text-right hidden sm:block">
                        <div className="font-mono text-sm">${score.current_price?.toFixed(2)}</div>
                        <div className="text-xs text-text-secondary font-mono">
                          {score.pct_from_200wma != null && `${score.pct_from_200wma.toFixed(1)}% vs 200WMA`}
                        </div>
                      </div>
                      <SignalBadge signal={score.signal || 'WATCH'} />
                    </>
                  )}
                  <button
                    onClick={() => handleRemove(item.ticker)}
                    className="text-text-secondary hover:text-red-400 transition-colors text-xs font-mono px-2"
                  >
                    ✕
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
