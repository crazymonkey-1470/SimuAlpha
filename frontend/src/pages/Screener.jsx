import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import supabase from '../supabaseClient';
import ScreenerTable from '../components/ScreenerTable';
import TLILegend from '../components/TLILegend';

export default function Screener() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('screener_results')
        .select('*')
        .order('total_score', { ascending: false });

      setResults(data || []);
      if (data && data.length > 0) {
        const newest = data.reduce((a, b) =>
          new Date(a.last_updated) > new Date(b.last_updated) ? a : b
        );
        setLastUpdated(newest.last_updated);
      }
      setLoading(false);
    }
    load();
  }, []);

  const filtered = filter === 'ALL'
    ? results
    : results.filter((r) => r.signal === filter);

  function formatAgo(ts) {
    if (!ts) return '';
    const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 py-8"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="font-heading font-bold text-xl">
            <span className="text-green">STOCK</span> SCREENER
          </h1>
          <TLILegend />
        </div>
        <div className="text-[10px] font-mono text-text-secondary">
          {lastUpdated && `Updated ${formatAgo(lastUpdated)}`}
          {results.length > 0 && ` · ${results.length} stocks`}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {['ALL', 'LOAD THE BOAT', 'ACCUMULATE', 'WATCH'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 text-[10px] font-mono tracking-wider transition-colors ${
              filter === f
                ? 'text-green bg-green/10 border border-green/30'
                : 'text-text-secondary border border-border hover:text-text-primary'
            }`}
          >
            {f} {f !== 'ALL' && `(${results.filter((r) => r.signal === f).length})`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-bg-card border border-border">
        {loading ? (
          <div className="text-center py-16 text-text-secondary font-mono text-sm">
            Loading...
          </div>
        ) : (
          <ScreenerTable data={filtered} />
        )}
      </div>
    </motion.div>
  );
}
