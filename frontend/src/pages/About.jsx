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
    fontSize: 'clamp(40px, 6vw, 72px)', lineHeight: 1,
    color: 'var(--text-primary)', margin: '0 0 24px',
  },
  accent: { color: 'var(--signal-green)', fontStyle: 'italic' },
  lede: {
    fontFamily: 'IBM Plex Mono', fontSize: 14, lineHeight: 1.9,
    color: 'var(--text-secondary)', maxWidth: 680, margin: '0 0 12px',
  },

  section: { padding: '32px 0 48px' },
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

  pillarsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 16,
    marginTop: 12,
  },
  pillarCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 26,
  },
  pillarNum: {
    fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--signal-green)',
    letterSpacing: '0.14em', marginBottom: 14, display: 'block',
  },
  pillarTitle: {
    fontFamily: 'Cormorant Garamond', fontSize: 24, fontWeight: 400,
    color: 'var(--text-primary)', margin: '0 0 10px', lineHeight: 1.15,
  },
  pillarBody: {
    fontFamily: 'IBM Plex Mono', fontSize: 12, lineHeight: 1.75,
    color: 'var(--text-secondary)',
  },

  quote: {
    borderLeft: '2px solid var(--signal-green)',
    padding: '6px 0 6px 22px',
    margin: '24px 0 24px',
    fontFamily: 'Cormorant Garamond',
    fontStyle: 'italic',
    fontSize: 22,
    lineHeight: 1.5,
    color: 'var(--text-primary)',
    fontWeight: 300,
    maxWidth: 680,
  },

  ctaBlock: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '48px 36px', textAlign: 'center',
    margin: '32px 0 64px',
  },
  ctaTitle: {
    fontFamily: 'Cormorant Garamond', fontSize: 'clamp(28px, 4vw, 40px)',
    fontWeight: 300, color: 'var(--text-primary)', lineHeight: 1.1,
    margin: '0 0 14px',
  },
  ctaSub: {
    fontFamily: 'IBM Plex Mono', fontSize: 12, color: 'var(--text-secondary)',
    margin: '0 0 26px',
  },
  ctaRow: { display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' },
  btnPrimary: {
    fontFamily: 'IBM Plex Mono', fontSize: 13, fontWeight: 600,
    padding: '14px 28px', borderRadius: 8, letterSpacing: '0.05em',
    textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10,
    background: 'var(--signal-green)', color: '#0c0c0e', border: 'none',
  },
  btnSecondary: {
    fontFamily: 'IBM Plex Mono', fontSize: 13, fontWeight: 600,
    padding: '13px 27px', borderRadius: 8, letterSpacing: '0.05em',
    textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10,
    background: 'transparent', color: 'var(--text-primary)',
    border: '1px solid var(--border-light)',
  },
};

const pillars = [
  {
    num: '01 — TRANSPARENCY',
    title: 'Show the math, not the marketing',
    body: 'Every score has receipts. Every signal links back to the inputs that made it. No black-box rankings, no paid placements, no "trust us" — just the numbers that drove the call.',
  },
  {
    num: '02 — INDEPENDENCE',
    title: 'No conflicts, no kickbacks',
    body: 'We do not sell research to issuers. We do not run a brokerage. We do not take payment for coverage. The only incentive that matters is being right for the retail investor reading the screen.',
  },
  {
    num: '03 — RIGOR',
    title: 'Institutional methods, retail price',
    body: 'The same disciplines used by hedge funds — 13F tracking, multi-stage DCFs, technical confluence, regime detection — running continuously across thousands of tickers, surfaced as a single legible verdict.',
  },
  {
    num: '04 — ACCOUNTABILITY',
    title: 'Track every call, publish every miss',
    body: 'Signals are logged the moment they fire. Outcomes get measured against the original thesis. Win rates are reported honestly, and the algorithm learns from its own mistakes — out in the open.',
  },
];

export default function About() {
  useEffect(() => {
    const prev = document.title;
    document.title = 'SimuAlpha — Our Mission';
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
            <Link style={s.navLink} to="/about">About</Link>
            <Link style={s.navCta} to="/dashboard">Open Screener →</Link>
          </div>
        </div>
      </nav>

      <div style={s.page}>
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={s.hero}
        >
          <div style={s.eyebrow}>
            <span style={s.eyebrowDot} />
            What we&apos;re building
          </div>
          <h1 style={s.h1}>
            Institutional intelligence,<br />
            <span style={s.accent}>for everyone else.</span>
          </h1>
          <p style={s.lede}>
            For decades, the best stock research lived behind seven-figure
            terminals and capital-introduction dinners. SimuAlpha exists to
            close that gap — to take the workflows that hedge funds spend
            millions on and run them, automatically and continuously, on
            behalf of the retail investor.
          </p>
          <p style={s.lede}>
            We are not a newsletter. We are not a chat room. We are a system
            that scans, scores, and explains — and that holds itself to the
            same standard of evidence we&apos;d demand from any analyst.
          </p>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          style={s.section}
        >
          <div style={s.sectionLabel}>The Problem</div>
          <h2 style={s.h2}>The deck is stacked. We&apos;re trying to level it.</h2>
          <p style={s.body}>
            A retail investor today is asked to compete with desks that have
            real-time order flow, alternative datasets, dedicated quants, and
            an army of analysts paid to read every footnote. Most of what
            reaches the average investor is either lagging by quarters,
            bundled with someone else&apos;s incentives, or reduced to a
            single talking head&apos;s opinion.
          </p>
          <div style={s.quote}>
            &ldquo;The information asymmetry isn&apos;t a market inefficiency.
            It&apos;s the entire business model.&rdquo;
          </div>
          <p style={s.body}>
            SimuAlpha attacks that asymmetry directly: by aggregating the
            signals that already exist in the public record — 13F filings,
            STOCK Act disclosures, fundamental data, technical structure —
            and assembling them into a single, scoreable picture. Nothing we
            do is exotic. What&apos;s new is that it runs end-to-end, every
            day, for every ticker, for anyone.
          </p>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          style={s.section}
        >
          <div style={s.sectionLabel}>What we strive for</div>
          <h2 style={s.h2}>Four principles, no exceptions.</h2>
          <div style={s.pillarsGrid} className="card-grid">
            {pillars.map((p, i) => (
              <motion.div
                key={p.num}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                style={s.pillarCard}
              >
                <span style={s.pillarNum}>{p.num}</span>
                <h3 style={s.pillarTitle}>{p.title}</h3>
                <p style={s.pillarBody}>{p.body}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          style={s.section}
        >
          <div style={s.sectionLabel}>Where we&apos;re going</div>
          <h2 style={s.h2}>The roadmap.</h2>
          <p style={s.body}>
            The screener is step one. The destination is a system that can
            walk a retail investor through every part of the decision —
            sizing, entry, hedging, exit — with the same coherent logic
            applied to a $5,000 account that an allocator would apply to a
            $5B one. Evidence in. Verdict out. Track record kept.
          </p>
          <p style={s.body}>
            We&apos;re building it in public, shipping in increments, and
            measuring ourselves the only way that matters: by whether the
            calls held up.
          </p>
        </motion.section>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          style={s.ctaBlock}
        >
          <h2 style={s.ctaTitle}>
            Want to see the <span style={s.accent}>system</span> in action?
          </h2>
          <p style={s.ctaSub}>
            The screener is live. Free tier, no card required.
          </p>
          <div style={s.ctaRow}>
            <Link style={s.btnPrimary} to="/dashboard">
              Open Screener →
            </Link>
            <Link style={s.btnSecondary} to="/">
              Back to Home
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
