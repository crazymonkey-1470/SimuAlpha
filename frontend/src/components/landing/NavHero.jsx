import CapitalFlowGlobe from './CapitalFlowGlobe';

const ABOUT_URL = '/about';

const s = {
  nav: {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
    height: 52,
    background: 'rgba(12,12,14,0.85)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderBottom: '1px solid var(--border)',
    display: 'flex', alignItems: 'center',
  },
  navInner: {
    maxWidth: 1100, margin: '0 auto', width: '100%',
    padding: '0 24px',
    display: 'flex', alignItems: 'center', gap: 32,
  },
  wm: {
    fontFamily: 'Cormorant Garamond', fontSize: 22, fontWeight: 400,
    color: 'var(--text-primary)', lineHeight: 1, textDecoration: 'none',
  },
  wmAccent: { color: 'var(--signal-green)', fontStyle: 'italic' },
  navLinks: { display: 'flex', gap: 24, marginLeft: 'auto', alignItems: 'center' },
  navLink: {
    fontFamily: 'IBM Plex Mono', fontSize: 12, color: 'var(--text-secondary)',
    textDecoration: 'none', letterSpacing: '0.03em', transition: 'color 0.15s ease',
  },
  navCta: {
    fontFamily: 'IBM Plex Mono', fontSize: 11, fontWeight: 600,
    color: '#0c0c0e', background: 'var(--signal-green)',
    padding: '8px 16px', borderRadius: 6, letterSpacing: '0.05em',
    textDecoration: 'none', whiteSpace: 'nowrap',
  },

  page: { maxWidth: 1100, margin: '0 auto', padding: '0 24px' },

  hero: {
    position: 'relative',
    padding: '112px 0 48px',
    minHeight: 720,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 40,
    alignItems: 'center',
  },
  heroText: { position: 'relative', zIndex: 2 },
  eyebrow: {
    fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--signal-green)',
    letterSpacing: '0.2em', textTransform: 'uppercase',
    display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 28,
  },
  eyebrowDot: {
    width: 6, height: 6, borderRadius: '50%',
    background: 'var(--signal-green)', animation: 'pulse-green 2s infinite',
  },
  h1: {
    fontFamily: 'Cormorant Garamond', fontWeight: 300,
    fontSize: 'clamp(44px, 6.5vw, 88px)', lineHeight: 0.92,
    color: 'var(--text-primary)', margin: '0 0 22px',
    textAlign: 'left',
  },
  h1Accent: { color: 'var(--signal-green)', fontStyle: 'italic' },
  sub: {
    fontFamily: 'IBM Plex Mono', fontSize: 13, lineHeight: 1.9,
    color: 'var(--text-secondary)', maxWidth: 480, margin: '0 0 32px',
    textAlign: 'left',
  },
  ctas: { display: 'flex', gap: 14, justifyContent: 'flex-start', flexWrap: 'wrap' },
  btnPrimary: {
    fontFamily: 'IBM Plex Mono', fontSize: 13, fontWeight: 600,
    padding: '14px 32px', borderRadius: 8, letterSpacing: '0.05em',
    cursor: 'pointer', textDecoration: 'none',
    display: 'inline-flex', alignItems: 'center', gap: 10,
    transition: 'all 0.15s ease', border: 'none',
    background: 'var(--signal-green)', color: '#0c0c0e',
  },
  btnSecondary: {
    fontFamily: 'IBM Plex Mono', fontSize: 13, fontWeight: 600,
    padding: '13px 31px', borderRadius: 8, letterSpacing: '0.05em',
    cursor: 'pointer', textDecoration: 'none',
    display: 'inline-flex', alignItems: 'center', gap: 10,
    transition: 'all 0.15s ease',
    background: 'transparent', color: 'var(--text-primary)',
    border: '1px solid var(--border-light)',
  },
};

export default function NavHero() {
  return (
    <>
      <nav style={s.nav}>
        <div style={s.navInner}>
          <a href="#top" style={s.wm}>
            Simu<span style={s.wmAccent}>Alpha</span>
          </a>
          <div style={s.navLinks} className="hide-mobile landing-nav-links">
            <a className="nav-link" style={s.navLink} href="#features">Features</a>
            <a className="nav-link" style={s.navLink} href="#compare">Compare</a>
            <a className="nav-link" style={s.navLink} href="#pricing">Pricing</a>
            <a className="nav-link" style={s.navLink} href={ABOUT_URL}>About</a>
            <a style={s.navCta} href="/dashboard">Open Screener →</a>
          </div>
        </div>
      </nav>

      <div style={s.page} id="top">
        <section className="hero-v2 landing-hero" style={s.hero}>
          <div className="hero-text" style={s.heroText}>
            <div style={s.eyebrow}>
              <span style={s.eyebrowDot} />
              Now scanning — 512 stocks · 19+ sources
            </div>
            <h1 style={s.h1}>
              <span className="w" style={{ '--i': 0 }}>Cutting</span>
              <span className="w" style={{ '--i': 1 }}>edge</span>
              <span className="w" style={{ '--i': 2, ...s.h1Accent }}>AI</span>
              <br />
              <span className="w" style={{ '--i': 3 }}>for</span>
              <span className="w letters sweep" style={{ '--i': 4 }}>
                {['E','v','e','r','y','o','n','e'].map((ch, j) => (
                  <span key={j} className="l" style={{ '--j': j }}>{ch}</span>
                ))}
              </span>
            </h1>
            <p style={s.sub}>
              An autonomous system powered by cutting-edge AI — built on decades of
              investing wisdom from history's greatest investors and combined with
              multiple layers of market intelligence to find the opportunities worth
              your attention.
            </p>
            <div className="ctas" style={s.ctas}>
              <a style={s.btnPrimary} href={ABOUT_URL}>
                Our Mission →
              </a>
              <a style={s.btnSecondary} href="#features">
                See How It Works
              </a>
            </div>
          </div>

          <CapitalFlowGlobe />
        </section>
      </div>
    </>
  );
}
