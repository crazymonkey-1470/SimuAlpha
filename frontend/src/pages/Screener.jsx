import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import ScreenerTable from '../components/ScreenerTable';
import TLILegend from '../components/TLILegend';

export default function Screener() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [customTickers, setCustomTickers] = useState('');
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    fetchResults();
  }, []);

  async function fetchResults() {
    try {
      const res = await api.getResults();
      setResults(res.results || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function runScan() {
    setScanning(true);
    try {
      const tickers = customTickers
        ? customTickers.split(',').map((t) => t.trim()).filter(Boolean)
        : undefined;
      const res = await api.scan(tickers);
      setResults(res.results || []);
    } catch (err) {
      console.error('Scan failed:', err);
    } finally {
      setScanning(false);
    }
  }

  const filtered = filter === 'ALL'
    ? results
    : results.filter((r) => r.signal === filter);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 py-8"
    >
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading font-bold text-2xl">
          <span className="text-accent">STOCK</span> SCREENER
        </h1>
        <div className="text-xs font-mono text-text-secondary">
          {results.length} stocks loaded
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          placeholder="Custom tickers (e.g. AAPL, MSFT, TSLA)"
          value={customTickers}
          onChange={(e) => setCustomTickers(e.target.value)}
          className="flex-1 px-3 py-2 bg-bg-card border border-border text-sm font-mono text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent"
        />
        <button
          onClick={runScan}
          disabled={scanning}
          className="px-4 py-2 bg-accent text-bg font-mono text-xs font-medium tracking-wider hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {scanning ? 'SCANNING...' : 'SCAN'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {['ALL', 'LOAD THE BOAT', 'ACCUMULATE', 'WATCH'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-mono transition-colors ${
              filter === f
                ? 'text-accent bg-accent/10 border border-accent/30'
                : 'text-text-secondary border border-border hover:text-text-primary'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="mb-4">
        <TLILegend />
      </div>

      {/* Table */}
      <div className="bg-bg-card border border-border">
        {loading ? (
          <div className="text-center py-12 text-text-secondary font-mono text-sm">
            Loading cached results...
          </div>
        ) : (
          <ScreenerTable data={filtered} />
        )}
      </div>
    </motion.div>
  );
}
