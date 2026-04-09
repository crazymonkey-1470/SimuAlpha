import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Screener from './pages/Screener';
import DeepDive from './pages/DeepDive';
import Signals from './pages/Signals';
import Watchlist from './pages/Watchlist';
import SuperInvestors from './pages/SuperInvestors';
import InvestorDetail from './pages/InvestorDetail';
import MarketContext from './pages/MarketContext';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="screener" element={<Screener />} />
          <Route path="ticker/:symbol" element={<DeepDive />} />
          <Route path="signals" element={<Signals />} />
          <Route path="investors" element={<SuperInvestors />} />
          <Route path="investor/:id" element={<InvestorDetail />} />
          <Route path="market" element={<MarketContext />} />
          <Route path="watchlist" element={<Watchlist />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
