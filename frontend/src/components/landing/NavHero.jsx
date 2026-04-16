import { motion } from 'framer-motion';

const PATREON_URL = import.meta.env.VITE_PATREON_URL || 'https://www.patreon.com/simualpha';

const s = {
  nav: {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
    background: 'rgba(12,12,14,0.85)', backdropFilter: 'blur(12px)',
    borderBottom: '1px solid var(--border)',
    fontFamily: 'IBM Plex Mono',
  },
  navInner: {
    maxWidth: 1100, margin: '0 auto', padding: '0 24px',
    height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  logo: {
    fontFamily: 'Cormorant Garamond', fontSize: 22, fontWeight: 500,
    color: 'var(--text-primary)', letterSpacing: '0.02em', textDecoration: 'none',
  },
  logoAccent: { color: 'var(--signal-green)', fontStyle: 'italic' },
  navLinks: { display: 'flex', gap: 28, listStyle: 'none', margin: 0, padding: 0 },
  navLink: {
    fontSize: 11, color: 'var(--text-secondary)', textDecoration: 'none',
    letterSpacing: '0.08em', textTransform: 'uppercase',
    transition: 'color 0.15s',
  },
  ctaBtn: {
    background: 'var(--signal-green)', color: '#0c0c0e',
    border: 'none', borderRadius: 6, padding: '8px 18px',
    fontFamily: 'IBM Plex Mono', fontSize: 11, fontWeight: 700,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    cursor: 'pointer', textDecoration: 'none', display: 'inline-block',
  },
  hero: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    textAlign: 'center', padding: '120px 24px 80px',
  },
  eyebrow: {
    fontFamily: 'IBM Plex Mono', fontSize: 10, letterSpacing: '0.2em',
    textTransform: 'uppercase', color: 'var(--signal-green)',
    marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8,
  },
  dot: {
    width: 6, height: 6, borderRadius: '50%',
    background: 'var(--signal-green)', animation: 'pulse-green 2s infinite',
  },
  headline: {
    fontFamily: 'Cormorant Garamond', fontWeight: 300,
    fontSize: 'clamp(52px, 9vw, 112px)', lineHeight: 0.88,
    color: 'var(--text-primary)', marginBottom: 32,
  },
  accent: { color: 'var(--signal-green)', fontStyle: 'italic' },
  sub: {
    fontFamily: 'IBM Plex Mono', fontSize: 13, lineHeight: 1.9,
    color: 'var(--text-secondary)', maxWidth: 560, margin: '0 auto 40px',
  },
  btns: { display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' },
  outlineBtn: {
    background: 'transparent', color: 'var(--text-secondary)',
    border: '1px solid var(--border)', borderRadius: 6, padding: '12px 28px',
    fontFamily: 'IBM Plex Mono', fontSize: 11, letterSpacing: '0.08em',
    textTransform: 'uppercase', cursor: 'pointer', textDecoration: 'none',
    display: 'inline-block', transition: 'border-color 0.15s',
  },
  primaryBtn: {
    background: 'var(--signal-green)', color: '#0c0c0e',
    border: 'none', borderRadius: 6, padding: '12px 28px',
    fontFamily: 'IBM Plex Mono', fontSize: 11, fontWeight: 700,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    cursor: 'pointer', textDecoration: 'none', display: 'inline-block',
  },
};

export default function NavHero() {
  return (
    <>
      <nav style={s.nav}>
        <div style={s.navInner}>
          <a href="#top" style={s.logo}>
            Simu<span style={s.logoAccent}>Alpha</span>
          </a>
          <ul style={s.navLinks} className="hide-mobile">
            <li><a href="#features" style={s.navLink}>Features</a></li>
            <li><a href="#compare" style={s.navLink}>Compare</a></li>
            <li><a href="#faq" style={s.navLink}>FAQ</a></li>
            <li><a href="#pricing" style={s.navLink}>Pricing</a></li>
          </ul>
          <a href={PATREON_URL} target="_blank" rel="noopener noreferrer" style={s.ctaBtn}>
            Get Access
          </a>
        </div>
      </nav>

      <section id="top" style={s.hero}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div style={s.eyebrow}>
            <span style={s.dot} />
            AI-Powered Stock Discovery — Scanning Now
          </div>

          <h1 style={s.headline}>
            The Long<br />
            <span style={s.accent}>Investor's Edge</span>
          </h1>

          <p style={s.sub}>
            SimuAlpha scans the S&amp;P 500 daily — scoring every stock on 50pts of fundamentals
            and 50pts of technical position, then cross-referencing 8 super investors,
            congressional trades, and AI consensus to surface what actually deserves attention.
          </p>

          <div style={s.btns}>
            <a href={PATREON_URL} target="_blank" rel="noopener noreferrer" style={s.primaryBtn}>
              Join on Patreon
            </a>
            <a href="#features" style={s.outlineBtn}>
              See How It Works
            </a>
          </div>
        </motion.div>
      </section>
    </>
  );
}
