import { motion } from 'framer-motion';

const cards = [
  {
    label: 'TLI Scoring Engine',
    body: 'Proprietary 0–100 score: 50pts fundamentals (revenue growth, margins, FCF) + 50pts technical position relative to 200-week and 200-month moving averages.',
    accent: 'var(--signal-green)',
    symbol: '◈',
  },
  {
    label: 'SAIN Intelligence',
    body: '4-layer consensus: Super Investors (13F), Politicians (STOCK Act, committee-weighted), AI Models, and TLI score. Full-stack alignment is the highest conviction signal.',
    accent: 'var(--blue)',
    symbol: '◉',
  },
  {
    label: 'Elliott Wave Analysis',
    body: 'Automated wave counting pinpoints Wave 2, 4, and C entries. Wave 5 extensions are always avoided. Fibonacci targets calculated per setup.',
    accent: 'var(--gold)',
    symbol: '◌',
  },
  {
    label: 'Agentic Research',
    body: 'AI-written investment theses per ticker — analysed from 9 legendary investor perspectives. Kill-thesis flags, position sizing, and 5-tranche DCA plans included.',
    accent: '#a855f7',
    symbol: '◎',
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
          Most screeners give you data. SimuAlpha gives you a verdict.
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
              fontFamily: 'IBM Plex Mono', fontSize: 20,
              color: c.accent, marginBottom: 12,
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
