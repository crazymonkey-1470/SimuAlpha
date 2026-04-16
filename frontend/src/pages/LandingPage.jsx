import { useEffect } from 'react';
import NavHero from '../components/landing/NavHero';
import SocialProof from '../components/landing/SocialProof';
import Features from '../components/landing/Features';
import CompareTable from '../components/landing/CompareTable';
import FAQ from '../components/landing/FAQ';
import CTAFooter from '../components/landing/CTAFooter';

export default function LandingPage() {
  useEffect(() => {
    const prev = document.title;
    document.title = 'SimuAlpha — The Long Investor\'s Edge';
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
      <SocialProof />
      <Features />
      <CompareTable />
      <FAQ />
      <CTAFooter />
    </div>
  );
}
