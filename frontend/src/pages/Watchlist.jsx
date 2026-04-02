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

  useEffect(() => { loadWatchlist(); }, []);

  async function loadWatchlist() {
    const { data: wl } = await supabase.from('watchlist').select('*').order('added_at', { ascending: false });
    if (!wl || wl.length === 0) { setItems([]); setLoading(false); return; }

    const tickers = wl.map((w) => w.ticker);
    const { data: scores } = await supabase.from('screener_results').select('*').in('ticker', tickers);
    const scoreMap = Object.fromEntries((scores || []).map((s) => [s.ticker, s]));

    setItems(wl.map((w) => ({ ...w, score: scoreMap[w.ticker] || null })));
    setLoading(false);
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!ticker.trim()) return;
    setAdding(true);
    await supabase.from('watchlist').upsert({ ticker: ticker.trim().toUpperCase() }, { onConflict: 'ticker' });
    setTicker('');
    await loadWatchlist();
    setAdding(false);
  }

  async function handleRemove(t) {
    await supabase.from('watchlist').delete().eq('ticker', t);
    setItems((prev) => prev.filter((w) => w.ticker !== t));
  }

  async function handleNotes(t, notes) {
    await supabase.from('watchlist').update({ notes }).eq('ticker', t);
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

      <h1 className="font-heading font-bold text-lg mb-5"><span className="text-green">MY</span> WATCHLIST</h1>

      <form onSubmit={handleAdd} className="flex gap-2 mb-6">
        <input type="text" placeholder="Ticker" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())}
          className="px-3 py-1.5 bg-bg-card border border-border text-[11px] font-mono text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-green/50 w-28" />
        <button type="submit" disabled={adding || !ticker.trim()}
          className="px-3 py-1.5 bg-green text-bg font-mono text-[10px] font-medium tracking-wider hover:bg-green/90 disabled:opacity-50 disabled:cursor-not-allowed">
          {adding ? '...' : '+ ADD'}
        </button>
      </form>

      {loading ? <div className="text-center py-12 font-mono text-text-secondary text-xs">Loading...</div>
      : items.length === 0 ? (
        <div className="text-center py-16 border border-border bg-bg-card">
          <div className="font-mono text-text-secondary text-sm mb-2">Watchlist is empty</div>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <motion.div key={item.ticker} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-bg-card border border-border p-3 hover:bg-bg-card-hover transition-colors">
              <div className="flex items-center gap-3">
                {item.score && <ScoreRing score={item.score.total_score || 0} size={36} strokeWidth={2.5} />}
                <div>
                  <Link to={`/ticker/${item.ticker}`} className="font-mono font-medium text-green hover:underline text-xs">{item.ticker}</Link>
                  {item.score?.company_name && <div className="text-[9px] text-text-secondary">{item.score.company_name}</div>}
                  {!item.score && <div className="text-[9px] text-amber">Not yet in candidate pool</div>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-1 sm:flex-none">
                <input type="text" defaultValue={item.notes || ''} placeholder="Notes..."
                  onBlur={(e) => handleNotes(item.ticker, e.target.value)}
                  className="flex-1 sm:w-44 px-2 py-1 bg-transparent border border-border/40 text-[10px] font-mono text-text-secondary placeholder:text-text-secondary/30 focus:outline-none focus:border-green/30" />
                {item.score && (
                  <>
                    <span className="font-mono text-[10px] hidden sm:block">${Number(item.score.current_price).toFixed(2)}</span>
                    <SignalBadge signal={item.score.signal || 'WATCH'} compact />
                    {item.score.entry_zone && <span className="text-[8px] text-green font-mono">ENTRY</span>}
                  </>
                )}
                <button onClick={() => handleRemove(item.ticker)}
                  className="text-text-secondary hover:text-red transition-colors text-[10px] font-mono px-1">✕</button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
