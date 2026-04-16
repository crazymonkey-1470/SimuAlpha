import { motion } from 'framer-motion';

const cards = [
  {
    label: 'Layer 1 — Conviction Scoring',
    body: 'Every stock gets a single number. One score. One verdict. The system decides what\'s worth your time so you don\'t have to.',
    accent: 'var(--signal-green)',
    symbol: '01',
  },
  {
    label: 'Layer 2 — Intelligence Network',
    body: '30+ independent data sources. When they agree, conviction is highest. When they disagree, you stay out.',
    accent: 'var(--blue)',
    symbol: '02',
  },
  {
    label: 'Layer 3 — Timing Engine',
    body: 'Knows where to enter, where to take profit, and where to walk away. Every signal comes with a plan.',
    accent: 'var(--gold)',
    symbol: '03',
  },
  {
    label: 'Layer 4 — AI Analyst',
    body: 'Writes the thesis. Stress-tests it. Tells you what could go wrong. Institutional-grade research on every opportunity.',
    accent: '#a855f7',
    symbol: '04',
  },
];

export default function Features() {
  return (
    <section id="features" style={{ padding: '96px 24px', maxWidth: 1100, margin: '0 auto' }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        style={{ textAlign: 'center', marginBottom: 52 }}
      >
        <h2 style={{
          fontFamily: 'Cormorant Garamond', fontSize: 'clamp(32px, 5vw, 56px)',
          fontWeight: 300, color: 'var(--text-primary)', marginBottom: 12,
        }}>
          Four Layers of Intelligence.<br />
          <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>One Clear Answer.</span>
        </h2>
        <p style={{
          fontFamily: 'IBM Plex Mono', fontSize: 12, color: 'var(--text-dim)',
          letterSpacing: '0.04em', maxWidth: 480, margin: '0 auto',
        }}>
          Most platforms give you data. SimuAlpha gives you a verdict.
        </p>
      </motion.div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 16,
      }}>
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.07 }}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '28px 24px',
            }}
          >
            <div style={{
              fontFamily: 'IBM Plex Mono', fontSize: 11, fontWeight: 500,
              letterSpacing: '0.12em', color: c.accent, marginBottom: 12,
            }}>
              {c.symbol}
            </div>
            <div style={{
              fontFamily: 'Cormorant Garamond', fontSize: 20, fontWeight: 500,
              color: 'var(--text-primary)', marginBottom: 10,
            }}>
              {c.label}
            </div>
            <div style={{
              fontFamily: 'IBM Plex Mono', fontSize: 11,
              color: 'var(--text-secondary)', lineHeight: 1.75,
            }}>
              {c.body}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
