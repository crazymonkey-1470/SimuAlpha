import { useEffect } from 'react';
import NavHero from '../components/landing/NavHero';
import TickerTape from '../components/landing/TickerTape';
import Features from '../components/landing/Features';
import CompareTable from '../components/landing/CompareTable';
import CTAFooter from '../components/landing/CTAFooter';

export default function LandingPage() {
  useEffect(() => {
    const prev = document.title;
    document.title = 'SimuAlpha — Cutting edge AI for Everyone';
    return () => { document.title = prev; };
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      overflowX: 'hidden',
    }}>
      <NavHero />
      <TickerTape />
      <Features />
      <CompareTable />
      <CTAFooter />
    </div>
  );
}
