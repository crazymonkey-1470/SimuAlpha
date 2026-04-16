import { motion } from 'framer-motion';

const stats = [
  { value: '500+', label: 'Stocks Scored Daily' },
  { value: '10+', label: 'Super Investors Tracked' },
  { value: '4-Layer', label: 'Consensus Engine' },
  { value: '30+', label: 'Intelligence Sources' },
  { value: '72%', label: 'Backtest Win Rate' },
];

export default function SocialProof() {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      style={{
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        padding: '28px 24px',
      }}
    >
      <div style={{
        maxWidth: 1100, margin: '0 auto',
        display: 'flex', flexWrap: 'wrap',
        justifyContent: 'center', gap: '32px 48px',
      }}>
        {stats.map((s, i) => (
          <div key={i} style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: 'Cormorant Garamond', fontSize: 32, fontWeight: 300,
              color: 'var(--signal-green)', lineHeight: 1,
            }}>
              {s.value}
            </div>
            <div style={{
              fontFamily: 'IBM Plex Mono', fontSize: 10, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: 'var(--text-dim)', marginTop: 6,
            }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </motion.section>
  );
}
