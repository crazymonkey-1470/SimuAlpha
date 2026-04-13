import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const STORAGE_KEY = 'simualpha_onboarding_done';

const STEPS = [
  {
    title: 'Welcome to The Long Screener',
    desc: 'An AI-powered stock screening platform that identifies fundamentally undervalued stocks at their 200-week and monthly moving averages.',
    action: 'Get Started',
  },
  {
    title: 'Screener & Scoring',
    desc: 'Every stock receives a TLI Score (0-100) combining 50pts fundamental analysis + 50pts technical position. Signals range from "Load the Boat" to "Avoid".',
    action: 'Next',
    link: '/screener',
    linkLabel: 'Open Screener',
  },
  {
    title: 'Deep Dive Analysis',
    desc: 'Click any stock to see full score breakdowns, Elliott Wave analysis, price targets, AI-generated investment theses, and SAIN 4-layer consensus.',
    action: 'Next',
  },
  {
    title: 'Watchlist & Alerts',
    desc: 'Add stocks to your watchlist for monitoring. Configure custom alerts with thresholds on any metric and get notified via Telegram.',
    action: 'Next',
    link: '/watchlist',
    linkLabel: 'Open Watchlist',
  },
  {
    title: 'Intelligence & Consensus',
    desc: 'The SAIN system aggregates signals from Super Investors, Politicians, AI Models, and TLI Scores. Full-stack alignment is the highest conviction signal.',
    action: 'Finish',
    link: '/intelligence',
    linkLabel: 'Intelligence Feed',
  },
];

export function useOnboarding() {
  const [done, setDone] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
  });
  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setDone(true);
  };
  return { showOnboarding: !done, dismiss };
}

export default function Onboarding({ onDismiss }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function handleAction() {
    if (isLast) {
      onDismiss();
    } else {
      setStep(s => s + 1);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: '16px', padding: '40px', marginBottom: '40px',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Progress dots */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '24px' }}>
        {STEPS.map((_, i) => (
          <div key={i} style={{
            width: i === step ? '24px' : '8px', height: '8px',
            borderRadius: '4px', transition: 'all 0.3s ease',
            background: i === step ? 'var(--signal-green)' : i < step ? 'var(--signal-green)40' : 'var(--border)',
          }} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          <div style={{
            fontFamily: 'Cormorant Garamond', fontSize: '32px', fontWeight: 400,
            color: 'var(--text-primary)', marginBottom: '12px',
          }}>
            {current.title}
          </div>
          <p style={{
            fontFamily: 'IBM Plex Mono', fontSize: '13px', color: 'var(--text-secondary)',
            lineHeight: 1.8, maxWidth: '600px', marginBottom: '24px',
          }}>
            {current.desc}
          </p>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              onClick={handleAction}
              style={{
                background: 'var(--signal-green)', color: '#0c0c0e', border: 'none',
                borderRadius: '8px', padding: '12px 28px',
                fontFamily: 'IBM Plex Mono', fontSize: '12px', fontWeight: 600,
                cursor: 'pointer', letterSpacing: '0.05em',
              }}
            >
              {current.action}
            </button>
            {current.link && (
              <button
                onClick={() => navigate(current.link)}
                style={{
                  background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: '8px', padding: '12px 24px', color: 'var(--text-secondary)',
                  fontFamily: 'IBM Plex Mono', fontSize: '12px', cursor: 'pointer',
                }}
              >
                {current.linkLabel}
              </button>
            )}
            <button
              onClick={onDismiss}
              style={{
                background: 'transparent', border: 'none', color: 'var(--text-dim)',
                fontFamily: 'IBM Plex Mono', fontSize: '11px', cursor: 'pointer',
                marginLeft: 'auto',
              }}
            >
              Skip
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
