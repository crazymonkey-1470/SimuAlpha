import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import supabase from './supabaseClient';
import Dashboard from './pages/Dashboard';
import Screener from './pages/Screener';
import DeepDive from './pages/DeepDive';
import Watchlist from './pages/Watchlist';

const navLinks = [
  { path: '/screener', label: 'SCREENER' },
  { path: '/watchlist', label: 'WATCHLIST' },
];

export default function App() {
  const location = useLocation();
  const [lastScan, setLastScan] = useState(null);

  useEffect(() => {
    supabase
      .from('scan_history')
      .select('scanned_at')
      .order('scanned_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data[0]) setLastScan(data[0].scanned_at);
      });
  }, [location.pathname]);

  function formatAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-40 border-b border-border bg-bg/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-12">
          <Link to="/" className="flex items-center gap-2">
            <span className="font-heading font-bold text-base text-green">TLI</span>
            <span className="font-heading text-xs text-text-secondary hidden sm:block">THE LONG SCREENER</span>
          </Link>
          <div className="flex items-center gap-3">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`px-2.5 py-1 text-[11px] font-mono tracking-widest transition-colors ${
                  location.pathname === link.path
                    ? 'text-green bg-green/10 border border-green/30'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {link.label}
              </Link>
            ))}
            {lastScan && (
              <span className="text-[10px] font-mono text-text-secondary hidden md:block">
                Last scan: {formatAgo(lastScan)}
              </span>
            )}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="pt-12">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/screener" element={<Screener />} />
            <Route path="/ticker/:symbol" element={<DeepDive />} />
            <Route path="/watchlist" element={<Watchlist />} />
          </Routes>
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4 mt-12">
        <p className="text-center text-[10px] font-mono text-text-secondary">
          Not financial advice. For educational and informational purposes only.
        </p>
      </footer>
    </div>
  );
}
