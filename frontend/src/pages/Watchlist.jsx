import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import supabase from '../supabaseClient';
import SignalBadge from '../components/SignalBadge';
import ScoreRing from '../components/ScoreRing';

export default function Watchlist() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ticker, setTicker] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadWatchlist();
  }, []);

  async function loadWatchlist() {
    const { data: watchlist } = await supabase
      .from('watchlist')
      .select('*')
      .order('added_at', { ascending: false });

    if (!watchlist || watchlist.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    // Fetch scores for all watchlist tickers
    const tickers = watchlist.map((w) => w.ticker);
    const { data: scores } = await supabase
      .from('screener_results')
      .select('*')
      .in('ticker', tickers);

    const scoreMap = Object.fromEntries((scores || []).map((s) => [s.ticker, s]));

    setItems(watchlist.map((w) => ({
      ...w,
      score: scoreMap[w.ticker] || null,
    })));
    setLoading(false);
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!ticker.trim()) return;
    setAdding(true);
    await supabase
      .from('watchlist')
      .upsert({ ticker: ticker.trim().toUpperCase() }, { onConflict: 'ticker' });
    setTicker('');
    await loadWatchlist();
    setAdding(false);
  }

  async function handleRemove(t) {
    await supabase.from('watchlist').delete().eq('ticker', t);
    setItems((prev) => prev.filter((w) => w.ticker !== t));
  }

  async function handleNotesChange(t, notes) {
    await supabase.from('watchlist').update({ notes }).eq('ticker', t);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 py-8"
    >
      <h1 className="font-heading font-bold text-xl mb-6">
        <span className="text-green">MY</span> WATCHLIST
      </h1>

      {/* Add form */}
      <form onSubmit={handleAdd} className="flex gap-3 mb-8">
        <input
          type="text"
          placeholder="Add ticker (e.g. AAPL)"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          className="px-3 py-2 bg-bg-card border border-border text-sm font-mono text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-green w-40"
        />
        <button
          type="submit"
          disabled={adding || !ticker.trim()}
          className="px-4 py-2 bg-green text-bg font-mono text-[11px] font-medium tracking-wider hover:bg-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {adding ? 'ADDING...' : '+ ADD'}
        </button>
      </form>

      {loading ? (
        <div className="text-center py-16 font-mono text-text-secondary text-sm">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 border border-border bg-bg-card">
          <div className="font-mono text-text-secondary text-sm mb-2">Watchlist is empty</div>
          <div className="font-mono text-text-secondary text-xs">
            Add tickers above or use the deep dive page.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <motion.div
              key={item.ticker}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-bg-card border border-border p-4 hover:bg-bg-card-hover transition-colors"
            >
              <div className="flex items-center gap-4">
                {item.score && <ScoreRing score={item.score.total_score || 0} size={40} strokeWidth={3} />}
                <div>
                  <Link
                    to={`/ticker/${item.ticker}`}
                    className="font-mono font-medium text-green hover:underline"
                  >
                    {item.ticker}
                  </Link>
                  {item.score?.company_name && (
                    <div className="text-[10px] text-text-secondary">{item.score.company_name}</div>
                  )}
                  {!item.score && (
                    <div className="text-[10px] text-amber">Not yet scanned</div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 flex-1 sm:flex-none">
                {/* Editable notes */}
                <input
                  type="text"
                  defaultValue={item.notes || ''}
                  placeholder="Notes..."
                  onBlur={(e) => handleNotesChange(item.ticker, e.target.value)}
                  className="flex-1 sm:w-48 px-2 py-1 bg-transparent border border-border/50 text-[11px] font-mono text-text-secondary placeholder:text-text-secondary/30 focus:outline-none focus:border-green/40"
                />

                {item.score && (
                  <>
                    <span className="font-mono text-xs hidden sm:block">
                      ${Number(item.score.current_price).toFixed(2)}
                    </span>
                    <SignalBadge signal={item.score.signal || 'WATCH'} />
                  </>
                )}

                <button
                  onClick={() => handleRemove(item.ticker)}
                  className="text-text-secondary hover:text-red transition-colors text-xs font-mono px-1"
                >
                  ✕
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
