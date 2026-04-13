import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import Layout from './components/Layout';
import LoadingSpinner from './components/LoadingSpinner';

// Lazy-load pages for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Screener = lazy(() => import('./pages/Screener'));
const DeepDive = lazy(() => import('./pages/DeepDive'));
const Signals = lazy(() => import('./pages/Signals'));
const My = lazy(() => import('./pages/My'));
const SuperInvestors = lazy(() => import('./pages/SuperInvestors'));
const InvestorDetail = lazy(() => import('./pages/InvestorDetail'));
const MarketContext = lazy(() => import('./pages/MarketContext'));
const AgentConsole = lazy(() => import('./pages/AgentConsole'));
const Compare = lazy(() => import('./pages/Compare'));
const Backtesting = lazy(() => import('./pages/Backtesting'));
const Landing = lazy(() => import('./pages/Landing'));

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div style={{ paddingTop: '100px' }}><LoadingSpinner /></div>}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Landing />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="screener" element={<Screener />} />
            <Route path="ticker/:symbol" element={<DeepDive />} />
            <Route path="signals" element={<Signals />} />
            <Route path="investors" element={<SuperInvestors />} />
            <Route path="investor/:id" element={<InvestorDetail />} />
            <Route path="market" element={<MarketContext />} />
            <Route path="my" element={<My />} />
            <Route path="compare" element={<Compare />} />
            <Route path="backtesting" element={<Backtesting />} />
            <Route path="agent" element={<AgentConsole />} />

            {/* Redirects from consolidated pages — preserve old bookmarks */}
            <Route path="watchlist" element={<Navigate to="/my?tab=watchlist" replace />} />
            <Route path="portfolio" element={<Navigate to="/my?tab=portfolio" replace />} />
            <Route path="intelligence" element={<Navigate to="/signals?tab=intelligence" replace />} />
            <Route path="consensus" element={<Navigate to="/signals?tab=consensus" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
