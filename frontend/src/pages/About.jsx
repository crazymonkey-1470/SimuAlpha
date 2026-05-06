import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const s = {
  shell: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    overflowX: 'hidden',
  },

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

  page: { maxWidth: 920, margin: '0 auto', padding: '0 24px' },

  hero: {
    padding: '140px 0 56px',
  },
  eyebrow: {
    fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--signal-green)',
    letterSpacing: '0.2em', textTransform: 'uppercase',
    display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 24,
  },
  eyebrowDot: {
    width: 6, height: 6, borderRadius: '50%',
    background: 'var(--signal-green)', animation: 'pulse-green 2s infinite',
  },
  h1: {
    fontFamily: 'Cormorant Garamond', fontWeight: 300,
    fontSize: 'clamp(36px, 5.5vw, 64px)', lineHeight: 1.05,
    color: 'var(--text-primary)', margin: '0 0 28px',
  },
  accent: { color: 'var(--signal-green)', fontStyle: 'italic' },
  lede: {
    fontFamily: 'IBM Plex Mono', fontSize: 14, lineHeight: 1.9,
    color: 'var(--text-secondary)', maxWidth: 680, margin: '0 0 12px',
  },

  section: { padding: '40px 0 48px' },
  sectionLabel: {
    fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--signal-green)',
    letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 14,
  },
  h2: {
    fontFamily: 'Cormorant Garamond', fontSize: 'clamp(28px, 4vw, 40px)',
    fontWeight: 300, color: 'var(--text-primary)', lineHeight: 1.1,
    margin: '0 0 22px',
  },
  body: {
    fontFamily: 'IBM Plex Mono', fontSize: 13, lineHeight: 1.9,
    color: 'var(--text-secondary)', maxWidth: 680, margin: '0 0 18px',
  },

  twoCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 16,
    marginTop: 12,
  },
  threeCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 16,
    marginTop: 12,
  },
  card: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 26,
  },
  cardLabel: {
    fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--signal-green)',
    letterSpacing: '0.14em', marginBottom: 14, display: 'block',
  },
  cardTitle: {
    fontFamily: 'Cormorant Garamond', fontSize: 26, fontWeight: 400,
    color: 'var(--text-primary)', margin: '0 0 8px', lineHeight: 1.15,
  },
  cardRole: {
    fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--signal-green)',
    letterSpacing: '0.05em', marginBottom: 14, fontWeight: 500,
  },
  cardBody: {
    fontFamily: 'IBM Plex Mono', fontSize: 12, lineHeight: 1.75,
    color: 'var(--text-secondary)',
  },

  quote: {
    borderLeft: '2px solid var(--signal-green)',
    padding: '8px 0 8px 24px',
    margin: '8px 0 32px',
    fontFamily: 'Cormorant Garamond',
    fontStyle: 'italic',
    fontSize: 'clamp(22px, 3vw, 30px)',
    lineHeight: 1.4,
    color: 'var(--text-primary)',
    fontWeight: 300,
    maxWidth: 720,
  },

  agentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 12,
    marginTop: 12,
  },
  agentRow: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '18px 20px',
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  agentCode: {
    fontFamily: 'IBM Plex Mono', fontSize: 12, fontWeight: 600,
    color: 'var(--signal-green)', letterSpacing: '0.12em',
  },
  agentRole: {
    fontFamily: 'IBM Plex Mono', fontSize: 12, color: 'var(--text-secondary)',
    lineHeight: 1.6,
  },
  hermesCard: {
    background: 'var(--bg-card)',
    border: '1px solid var(--signal-green)',
    borderRadius: 12, padding: '22px 24px',
    marginTop: 14,
    display: 'flex', flexDirection: 'column', gap: 8,
    position: 'relative',
  },
  hermesBadge: {
    position: 'absolute', top: -10, left: 22,
    fontFamily: 'IBM Plex Mono', fontSize: 9, letterSpacing: '0.14em',
    textTransform: 'uppercase', color: '#0c0c0e',
    background: 'var(--signal-green)',
    padding: '3px 10px', borderRadius: 3,
  },
  hermesCode: {
    fontFamily: 'Cormorant Garamond', fontSize: 24, fontWeight: 400,
    color: 'var(--text-primary)', fontStyle: 'italic',
  },
  hermesRole: {
    fontFamily: 'IBM Plex Mono', fontSize: 12, color: 'var(--text-secondary)',
    lineHeight: 1.7,
  },

  callout: {
    fontFamily: 'IBM Plex Mono', fontSize: 13, lineHeight: 1.8,
    color: 'var(--text-primary)', margin: '24px 0 0',
    padding: '16px 20px',
    background: 'var(--signal-green-dim)',
    border: '1px solid var(--signal-green)',
    borderRadius: 8,
    maxWidth: 720,
  },

  principleCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 24,
  },
  principleTitle: {
    fontFamily: 'Cormorant Garamond', fontSize: 22, fontWeight: 400,
    color: 'var(--text-primary)', fontStyle: 'italic',
    margin: '0 0 12px', lineHeight: 1.2,
  },
  principleBody: {
    fontFamily: 'IBM Plex Mono', fontSize: 12, lineHeight: 1.75,
    color: 'var(--text-secondary)',
  },

  stageBlock: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '40px 32px', textAlign: 'center',
    margin: '24px 0 56px',
  },
  stageTitle: {
    fontFamily: 'Cormorant Garamond', fontSize: 'clamp(28px, 4vw, 36px)',
    fontWeight: 300, color: 'var(--text-primary)', lineHeight: 1.1,
    margin: '0 0 14px',
  },
  stageBody: {
    fontFamily: 'IBM Plex Mono', fontSize: 13, color: 'var(--text-secondary)',
    margin: '0 auto', maxWidth: 560, lineHeight: 1.8,
  },

  attribution: {
    borderTop: '1px solid var(--border)',
    padding: '32px 0 56px',
    fontFamily: 'IBM Plex Mono', fontSize: 11,
    color: 'var(--text-dim)', lineHeight: 1.8,
    maxWidth: 680,
  },

  btnSecondary: {
    fontFamily: 'IBM Plex Mono', fontSize: 13, fontWeight: 600,
    padding: '13px 27px', borderRadius: 8, letterSpacing: '0.05em',
    textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10,
    background: 'transparent', color: 'var(--text-primary)',
    border: '1px solid var(--border-light)',
    marginTop: 16,
  },
};

const frameworks = [
  {
    label: 'FRAMEWORK 01',
    title: 'TLI Elliott Wave',
    role: 'Identifies when to enter and exit.',
    body: 'Removes the guesswork from timing by mapping market structure through Elliott Wave principles applied systematically.',
  },
  {
    label: 'FRAMEWORK 02',
    title: 'Camillo Social Arbitrage',
    role: 'Identifies what to buy.',
    body: 'Detects stocks moving from "off-radar" to "emerging awareness" before mainstream attention arrives. The same pattern that produces every major retail discovery, systemized.',
  },
];

const agents = [
  { code: 'ALPHA',     role: 'Data intake, X pipeline, real-time market monitoring' },
  { code: 'MACRO',     role: 'Macroeconomic and geopolitical intelligence' },
  { code: 'INSIDER',   role: 'SEC filing analysis (13F super investors + STOCK Act politicians)' },
  { code: 'CAMILLO',   role: 'Social arbitrage, trend detection, narrative analysis' },
  { code: 'SENTINEL',  role: 'Competitive intelligence and market gaps' },
  { code: 'INTEGRITY', role: 'Cross-referencing, audit, truth verification' },
];

const principles = [
  {
    title: 'Signals, not noise.',
    body: 'We filter thousands of data points daily so you see only what genuinely changes your understanding.',
  },
  {
    title: 'Frameworks over guesses.',
    body: "Every call has a methodology behind it — you'll know why we think what we think.",
  },
  {
    title: 'Accountable.',
    body: 'Every call is recorded, scored, and published. We eat our own cooking.',
  },
];

export default function About() {
  useEffect(() => {
    const prev = document.title;
    document.title = 'SimuAlpha — About';
    window.scrollTo(0, 0);
    return () => { document.title = prev; };
  }, []);

  return (
    <div style={s.shell}>
      <nav style={s.nav}>
        <div style={s.navInner}>
          <Link to="/" style={s.wm}>
            Simu<span style={s.wmAccent}>Alpha</span>
          </Link>
          <div style={s.navLinks} className="hide-mobile">
            <Link style={s.navLink} to="/#features">Features</Link>
            <Link style={s.navLink} to="/#pricing">Pricing</Link>
            <Link style={s.navCta} to="/about">About →</Link>
          </div>
        </div>
      </nav>

      <div style={s.page}>
        {/* ── Hero ──────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={s.hero}
        >
          <div style={s.eyebrow}>
            <span style={s.eyebrowDot} />
            About SimuAlpha
          </div>
          <h1 style={s.h1}>
            Transforming information asymmetry into{' '}
            <span style={s.accent}>investment edge.</span>
          </h1>
          <p style={s.lede}>
            SimuAlpha is an AI-powered stock discovery platform built on the
            belief that the biggest returns come from seeing what others
            don&apos;t — and acting before they do.
          </p>
        </motion.section>

        {/* ── Two Frameworks ────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          style={s.section}
        >
          <div style={s.sectionLabel}>Two proprietary frameworks</div>
          <h2 style={s.h2}>What to buy, and when.</h2>
          <p style={s.body}>
            We combine two proprietary frameworks that, together, answer the
            only two questions that matter.
          </p>

          <div style={s.twoCol} className="card-grid">
            {frameworks.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                style={s.card}
              >
                <span style={s.cardLabel}>{f.label}</span>
                <h3 style={s.cardTitle}>{f.title}</h3>
                <div style={s.cardRole}>{f.role}</div>
                <p style={s.cardBody}>{f.body}</p>
              </motion.div>
            ))}
          </div>

          <div style={s.quote}>
            &ldquo;Together, they answer the only two questions that matter:
            what to buy, and when.&rdquo;
          </div>
        </motion.section>

        {/* ── How We Do It ──────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          style={s.section}
        >
          <div style={s.sectionLabel}>How we do it</div>
          <h2 style={s.h2}>A team of specialized AI agents.</h2>
          <p style={s.body}>
            Each agent has defined expertise, a knowledge base they maintain,
            and strict lane discipline. No black-box prompt soup — every
            output is signed, cross-referenced, and auditable.
          </p>

          <div style={s.agentGrid} className="agent-grid">
            {agents.map((a, i) => (
              <motion.div
                key={a.code}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                style={s.agentRow}
              >
                <span style={s.agentCode}>{a.code}</span>
                <span style={s.agentRole}>{a.role}</span>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.3 }}
            style={s.hermesCard}
          >
            <span style={s.hermesBadge}>Synthesis Layer</span>
            <span style={s.hermesCode}>Hermes</span>
            <span style={s.hermesRole}>
              Synthesis, oversight, final judgment. Hermes integrates output
              from every specialist agent and renders the final call.
            </span>
          </motion.div>

          <div style={s.callout}>
            Every output is signed, cross-referenced, and auditable.
            <strong style={{ color: 'var(--signal-green)' }}> No black boxes.</strong>
          </div>
        </motion.section>

        {/* ── Philosophy ────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          style={s.section}
        >
          <div style={s.sectionLabel}>Our philosophy</div>
          <h2 style={s.h2}>Three principles, no exceptions.</h2>

          <div style={s.threeCol} className="card-grid">
            {principles.map((p, i) => (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                style={s.principleCard}
              >
                <h3 style={s.principleTitle}>{p.title}</h3>
                <p style={s.principleBody}>{p.body}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* ── Stage ─────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          style={s.section}
        >
          <div style={s.sectionLabel}>Stage</div>
          <div style={s.stageBlock}>
            <h2 style={s.stageTitle}>
              Currently in <span style={s.accent}>private beta.</span>
            </h2>
            <p style={s.stageBody}>
              We&apos;re building the pipeline, refining the frameworks, and
              establishing our track record. Public access coming soon.
            </p>
            <Link style={s.btnSecondary} to="/">
              Back to Home
            </Link>
          </div>
        </motion.section>

        {/* ── Attribution & disclaimer ──────────────────────── */}
        <div style={s.attribution}>
          SimuAlpha is built by Andrew Jobson. All analysis is generated by
          AI agents and should not be considered financial advice. We are not
          a registered investment advisor.
        </div>
      </div>
    </div>
  );
}
