import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import supabase from '../supabaseClient';
import ScreenerTable from '../components/ScreenerTable';
import TLILegend from '../components/TLILegend';

const FILTERS = ['ALL', 'LOAD THE BOAT', 'ACCUMULATE', 'WATCH', 'ENTRY ZONE'];

export default function Screener() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase.from('screener_results').select('*').order('total_score', { ascending: false })
      .then(({ data }) => { setResults(data || []); setLoading(false); });
  }, []);

  const filtered = filter === 'ALL' ? results
    : filter === 'ENTRY ZONE' ? results.filter((r) => r.entry_zone)
    : results.filter((r) => r.signal === filter);

  const counts = {
    ALL: results.length,
    'LOAD THE BOAT': results.filter((r) => r.signal === 'LOAD THE BOAT').length,
    ACCUMULATE: results.filter((r) => r.signal === 'ACCUMULATE').length,
    WATCH: results.filter((r) => r.signal === 'WATCH').length,
    'ENTRY ZONE': results.filter((r) => r.entry_zone).length,
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <h1 className="font-heading font-bold text-lg"><span className="text-green">STOCK</span> SCREENER</h1>
          <TLILegend />
        </div>
        <span className="text-[10px] font-mono text-text-secondary">
          Showing {filtered.length} of {results.length} scored
        </span>
      </div>

      {/* Search */}
      <input type="text" placeholder="Search ticker or company..." value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full sm:w-64 px-3 py-1.5 mb-4 bg-bg-card border border-border text-[11px] font-mono text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-green/50" />

      {/* Filters */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-2.5 py-1 text-[9px] font-mono tracking-wider transition-colors ${
              filter === f ? 'text-green bg-green-dim border border-green/30' : 'text-text-secondary border border-border hover:text-text-primary'}`}>
            {f} ({counts[f]})
          </button>
        ))}
      </div>

      <div className="bg-bg-card border border-border">
        {loading
          ? <div className="text-center py-12 text-text-secondary font-mono text-xs">Loading...</div>
          : <ScreenerTable data={filtered} searchQuery={search} />}
      </div>
    </motion.div>
  );
}
