import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Dashboard from './pages/Dashboard';
import Screener from './pages/Screener';
import DeepDive from './pages/DeepDive';
import Watchlist from './pages/Watchlist';

const navItems = [
  { path: '/', label: 'DASHBOARD' },
  { path: '/screener', label: 'SCREENER' },
  { path: '/watchlist', label: 'WATCHLIST' },
];

export default function App() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-bg">
      {/* Scanline effect */}
      <div className="scanline-overlay" />

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-40 border-b border-border bg-bg/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          <Link to="/" className="flex items-center gap-2">
            <span className="font-heading font-bold text-lg text-accent">TLI</span>
            <span className="font-heading text-sm text-text-secondary hidden sm:block">THE LONG SCREENER</span>
          </Link>
          <div className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-3 py-1.5 text-xs font-mono tracking-wider transition-colors ${
                  location.pathname === item.path
                    ? 'text-accent bg-accent/10 border border-accent/30'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="pt-14">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/screener" element={<Screener />} />
            <Route path="/ticker/:symbol" element={<DeepDive />} />
            <Route path="/watchlist" element={<Watchlist />} />
          </Routes>
        </AnimatePresence>
      </main>
    </div>
  );
}
