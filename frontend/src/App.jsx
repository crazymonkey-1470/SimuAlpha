import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import Layout from './components/Layout';
import LoadingSpinner from './components/LoadingSpinner';

// Lazy-load pages for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Screener = lazy(() => import('./pages/Screener'));
const DeepDive = lazy(() => import('./pages/DeepDive'));
const Signals = lazy(() => import('./pages/Signals'));
const Watchlist = lazy(() => import('./pages/Watchlist'));
const SuperInvestors = lazy(() => import('./pages/SuperInvestors'));
const InvestorDetail = lazy(() => import('./pages/InvestorDetail'));
const MarketContext = lazy(() => import('./pages/MarketContext'));
const IntelligenceFeed = lazy(() => import('./pages/IntelligenceFeed'));
const ConsensusLeaderboard = lazy(() => import('./pages/ConsensusLeaderboard'));
const AgentConsole = lazy(() => import('./pages/AgentConsole'));
const Compare = lazy(() => import('./pages/Compare'));
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
            <Route path="watchlist" element={<Watchlist />} />
            <Route path="intelligence" element={<IntelligenceFeed />} />
            <Route path="consensus" element={<ConsensusLeaderboard />} />
            <Route path="compare" element={<Compare />} />
            <Route path="agent" element={<AgentConsole />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
