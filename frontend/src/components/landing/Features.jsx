import { motion } from 'framer-motion';

const layers = [
  {
    num: 'LAYER 01 — 🏷️',
    title: 'Super Investors',
    body: 'Eight legendary managers tracked in real time via SEC 13F filings. Buffett, Ackman, Burry, Klarman, Marks, and more. We show you when their positions converge.',
    tag: '13F · Quarterly · 8 managers',
  },
  {
    num: 'LAYER 02 — 🏛',
    title: 'Politicians',
    body: 'Every congressional STOCK Act disclosure, aggregated and ranked. Net-buys by committee, chamber, and trade size — because access is alpha.',
    tag: 'STOCK Act · 535 members · 30-day rolling',
  },
  {
    num: 'LAYER 03 — 🤖',
    title: 'AI Model Portfolios',
    body: 'Five leading LLMs run a live paper portfolio on our data. Their collective allocation serves as a cross-check on human intuition.',
    tag: 'GPT-5 · Claude Opus · Gemini · Llama · Grok',
  },
  {
    num: 'LAYER 04 — 📊',
    title: 'TLI Score (v2)',
    body: 'Our proprietary 0–100 score: 50pts fundamentals (DCF + EV/Sales + EV/EBITDA composite) + 50pts technical position vs the 200-week and monthly moving averages.',
    tag: 'Updated daily · 500 stocks',
  },
];

const styles = {
  section: { padding: '0 24px 96px', maxWidth: 1100, margin: '0 auto' },
  title: {
    fontFamily: 'Cormorant Garamond',
    fontSize: 'clamp(32px, 5vw, 48px)',
    fontWeight: 300, color: 'var(--text-primary)', lineHeight: 1,
    margin: '0 0 12px', textAlign: 'center',
  },
  accent: { color: 'var(--signal-green)', fontStyle: 'italic' },
  subtitle: {
    fontFamily: 'IBM Plex Mono', fontSize: 13, color: 'var(--text-secondary)',
    textAlign: 'center', maxWidth: 560, margin: '0 auto 56px', lineHeight: 1.8,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 16,
  },
  card: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 28, transition: 'all 0.15s ease',
  },
  num: {
    fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--signal-green)',
    letterSpacing: '0.14em', marginBottom: 18, display: 'block',
  },
  cardTitle: {
    fontFamily: 'Cormorant Garamond', fontSize: 26, fontWeight: 400,
    color: 'var(--text-primary)', margin: '0 0 10px', lineHeight: 1.1,
  },
  body: {
    fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--text-secondary)',
    lineHeight: 1.8, margin: '0 0 18px',
  },
  tag: {
    fontFamily: 'IBM Plex Mono', fontSize: 9, letterSpacing: '0.12em',
    textTransform: 'uppercase', color: 'var(--text-dim)',
  },
};

export default function Features() {
  return (
    <section id="features" style={styles.section}>
      <h2 style={styles.title}>
        Four Layers of Intelligence.<br />
        <span style={styles.accent}>One Clear Answer.</span>
      </h2>
      <p style={styles.subtitle}>
        Every verdict is the intersection of four independent signals. When all four agree,
        the Full-Stack Consensus fires — the rarest and highest-conviction state in the system.
      </p>

      <div style={styles.grid} className="card-grid">
        {layers.map((l, i) => (
          <motion.div
            key={l.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.06 }}
            style={styles.card}
            whileHover={{
              borderColor: 'var(--border-light)',
              backgroundColor: 'var(--bg-card-hover)',
            }}
          >
            <span style={styles.num}>{l.num}</span>
            <h3 style={styles.cardTitle}>{l.title}</h3>
            <p style={styles.body}>{l.body}</p>
            <span style={styles.tag}>{l.tag}</span>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
