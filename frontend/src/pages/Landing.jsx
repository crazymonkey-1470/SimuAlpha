import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const SIGNAL_HIERARCHY = [
  { signal: 'LOAD THE BOAT', color: '#10b981', desc: 'Maximum conviction. Fundamentals, technicals, and wave position all align at 200MA support.' },
  { signal: 'ACCUMULATE', color: '#3b82f6', desc: 'Strong setup. Building position as price approaches key support levels.' },
  { signal: 'WATCH', color: '#f59e0b', desc: 'On radar. Fundamentals qualify but price hasn\'t reached entry zone yet.' },
  { signal: 'HOLD', color: '#8b5cf6', desc: 'Existing position. Maintain but don\'t add at current levels.' },
  { signal: 'CAUTION', color: '#f97316', desc: 'Warning signs. Deteriorating fundamentals or extended technicals.' },
  { signal: 'TRIM', color: '#ef4444', desc: 'Reduce exposure. Multiple risk flags triggered.' },
  { signal: 'AVOID', color: '#6b7280', desc: 'Do not enter. Failed fundamental gate or kill thesis active.' },
];

const FEATURES = [
  {
    title: 'TLI Scoring Engine',
    desc: 'Proprietary 0-100 scoring combining 50pts fundamentals + 50pts technical position relative to 200-week and monthly moving averages.',
    icon: '\u{1F4CA}',
  },
  {
    title: 'Elliott Wave Analysis',
    desc: 'Automated wave counting identifies optimal Wave 2, 4, and C entry points. Wave 5 always avoided.',
    icon: '\u{1F30A}',
  },
  {
    title: 'SAIN Intelligence',
    desc: '4-layer consensus from Super Investors, Politicians, AI Models, and TLI scores. Full-stack alignment is the highest conviction signal.',
    icon: '\u{1F9E0}',
  },
  {
    title: 'Super Investor Tracking',
    desc: '8 legendary investors tracked via SEC 13F filings. Cross-reference their positions to find institutional consensus.',
    icon: '\u{1F4BC}',
  },
  {
    title: 'Agentic Analysis',
    desc: 'AI-powered deep analysis generates investment theses, compares to investing greats, and auto-sizes positions.',
    icon: '\u{1F916}',
  },
  {
    title: 'Macro Risk Engine',
    desc: 'Real-time monitoring of market risk: S&P P/E, VIX, DXY, carry trade, JPY intervention risk, and geopolitical factors.',
    icon: '\u{1F310}',
  },
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div style={{ paddingTop: '48px' }}>
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        style={{ marginBottom: '80px', textAlign: 'center' }}
      >
        <div style={{
          fontFamily: 'Cormorant Garamond',
          fontSize: 'clamp(56px, 10vw, 120px)',
          fontWeight: 300,
          color: 'var(--text-primary)',
          lineHeight: 0.85,
          marginBottom: '24px',
        }}>
          The Long<br />
          <span style={{ color: 'var(--signal-green)', fontStyle: 'italic' }}>
            Screener
          </span>
        </div>

        <p style={{
          fontFamily: 'IBM Plex Mono',
          fontSize: '14px',
          color: 'var(--text-secondary)',
          maxWidth: '600px',
          margin: '0 auto 40px',
          lineHeight: 1.8,
        }}>
          An AI-powered stock screening platform that identifies fundamentally
          undervalued stocks at their 200-week and monthly moving averages.
          Combining quantitative scoring, Elliott Wave analysis, and multi-source
          intelligence into one unified system.
        </p>

        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
          <button
            onClick={() => navigate('/screener')}
            style={{
              background: 'var(--signal-green)',
              color: '#0c0c0e',
              border: 'none',
              borderRadius: '8px',
              padding: '14px 32px',
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
          >
            Open Screener
          </button>
          <button
            onClick={() => navigate('/intelligence')}
            style={{
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '14px 32px',
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
          >
            Intelligence Feed
          </button>
        </div>
      </motion.div>

      {/* Features Grid */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        style={{ marginBottom: '80px' }}
      >
        <h2 style={{
          fontFamily: 'Cormorant Garamond',
          fontSize: '36px',
          fontWeight: 400,
          color: 'var(--text-primary)',
          textAlign: 'center',
          marginBottom: '40px',
        }}>
          How It Works
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '20px',
        }}>
          {FEATURES.map((feat, i) => (
            <motion.div
              key={feat.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.08 }}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '24px',
              }}
            >
              <div style={{ fontSize: '28px', marginBottom: '12px' }}>{feat.icon}</div>
              <div style={{
                fontFamily: 'Cormorant Garamond',
                fontSize: '20px',
                fontWeight: 500,
                color: 'var(--text-primary)',
                marginBottom: '8px',
              }}>
                {feat.title}
              </div>
              <div style={{
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: 'var(--text-secondary)',
                lineHeight: 1.7,
              }}>
                {feat.desc}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Signal Hierarchy */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        style={{ marginBottom: '80px' }}
      >
        <h2 style={{
          fontFamily: 'Cormorant Garamond',
          fontSize: '36px',
          fontWeight: 400,
          color: 'var(--text-primary)',
          textAlign: 'center',
          marginBottom: '12px',
        }}>
          Signal Hierarchy
        </h2>
        <p style={{
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px',
          color: 'var(--text-dim)',
          textAlign: 'center',
          marginBottom: '32px',
        }}>
          Every stock receives one of seven signals based on TLI scoring and technical position
        </p>

        <div style={{
          maxWidth: '600px',
          margin: '0 auto',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          overflow: 'hidden',
        }}>
          {SIGNAL_HIERARCHY.map((sig, i) => (
            <div
              key={sig.signal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '14px 20px',
                borderBottom: i < SIGNAL_HIERARCHY.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: sig.color,
                flexShrink: 0,
              }} />
              <div style={{
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                fontWeight: 600,
                color: sig.color,
                width: '140px',
                flexShrink: 0,
              }}>
                {sig.signal}
              </div>
              <div style={{
                fontFamily: 'IBM Plex Mono',
                fontSize: '10px',
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
              }}>
                {sig.desc}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        style={{
          textAlign: 'center',
          padding: '48px 0',
          marginBottom: '48px',
          borderTop: '1px solid var(--border)',
        }}
      >
        <div style={{
          fontFamily: 'Cormorant Garamond',
          fontSize: '32px',
          fontWeight: 300,
          color: 'var(--text-primary)',
          marginBottom: '16px',
        }}>
          Ready to find your next opportunity?
        </div>
        <button
          onClick={() => navigate('/screener')}
          style={{
            background: 'var(--signal-green)',
            color: '#0c0c0e',
            border: 'none',
            borderRadius: '8px',
            padding: '14px 40px',
            fontFamily: 'IBM Plex Mono',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: '0.05em',
          }}
        >
          Start Screening
        </button>
      </motion.div>

      {/* Disclaimer */}
      <div style={{
        fontFamily: 'IBM Plex Mono',
        fontSize: '11px',
        color: 'var(--text-dim)',
        padding: '20px 0',
        borderTop: '1px solid var(--border)',
        textAlign: 'center',
      }}>
        Not financial advice. AI-generated analysis for educational purposes only. Do your own research before investing.
      </div>
    </div>
  );
}
