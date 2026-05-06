import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import LoadingSpinner from './components/LoadingSpinner';

// Public pages — only routes currently exposed
const LandingPage = lazy(() => import('./pages/LandingPage'));
const About = lazy(() => import('./pages/About'));

// ─── Shelved app pages ─────────────────────────────────────────────
// Files kept in src/pages and src/components for future reactivation.
// To re-enable, restore the lazy imports and Routes inside the Layout
// wrapper below, and re-add `import Layout from './components/Layout'`.
//
// Previously routed:
//   /dashboard, /screener, /ticker/:symbol, /signals, /investors,
//   /investor/:id, /market, /my, /compare, /backtesting, /agent,
//   /watchlist, /portfolio, /intelligence, /consensus
// ───────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div style={{ paddingTop: '100px' }}><LoadingSpinner /></div>}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/about" element={<About />} />

          {/* Fallback — anything else goes to landing */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
