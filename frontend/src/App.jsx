import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import supabase from './supabaseClient';
import Dashboard from './pages/Dashboard';
import Screener from './pages/Screener';
import DeepDive from './pages/DeepDive';
import Signals from './pages/Signals';
import Watchlist from './pages/Watchlist';

const navLinks = [
  { path: '/screener', label: 'SCREENER' },
  { path: '/signals', label: 'SIGNALS' },
  { path: '/watchlist', label: 'WATCHLIST' },
];

export default function App() {
  const location = useLocation();
  const [lastScan, setLastScan] = useState(null);
  const [pipelineOk, setPipelineOk] = useState(null);

  useEffect(() => {
    supabase
      .from('scan_history')
      .select('scanned_at')
      .order('scanned_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data?.[0]) {
          setLastScan(data[0].scanned_at);
          const age = Date.now() - new Date(data[0].scanned_at).getTime();
          setPipelineOk(age < 24 * 60 * 60 * 1000); // within 24h
        }
      });
  }, [location.pathname]);

  function fmtAgo(ts) {
    if (!ts) return '';
    const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  return (
    <div className="min-h-screen bg-bg">
      <nav className="fixed top-0 left-0 right-0 z-40 border-b border-border bg-bg/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-11">
          <Link to="/" className="flex items-center gap-2">
            <span className="font-heading font-bold text-sm text-green">THE LONG SCREENER</span>
          </Link>
          <div className="flex items-center gap-2">
            {navLinks.map((l) => (
              <Link
                key={l.path}
                to={l.path}
                className={`px-2 py-1 text-[10px] font-mono tracking-widest transition-colors ${
                  location.pathname === l.path
                    ? 'text-green bg-green-dim border border-green/30'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {l.label}
              </Link>
            ))}
            {lastScan && (
              <div className="hidden md:flex items-center gap-1.5 ml-2">
                <span className={`w-1.5 h-1.5 rounded-full ${pipelineOk ? 'bg-green' : 'bg-red'}`} />
                <span className="text-[9px] font-mono text-text-secondary">{fmtAgo(lastScan)}</span>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="pt-11">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/screener" element={<Screener />} />
            <Route path="/ticker/:symbol" element={<DeepDive />} />
            <Route path="/signals" element={<Signals />} />
            <Route path="/watchlist" element={<Watchlist />} />
          </Routes>
        </AnimatePresence>
      </main>

      <footer className="border-t border-border py-3 mt-12">
        <p className="text-center text-[9px] font-mono text-text-secondary">
          Not financial advice. Educational tool only. Do your own research.
        </p>
      </footer>
    </div>
  );
}
