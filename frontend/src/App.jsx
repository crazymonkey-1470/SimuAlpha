import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import LoadingSpinner from './components/LoadingSpinner';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const AdminApprovalDashboard = lazy(() => import('./components/AdminApprovalDashboard'));

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div style={{ paddingTop: '100px' }}><LoadingSpinner /></div>}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/admin" element={<AdminApprovalDashboard />} />
          <Route path="*" element={<LandingPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
