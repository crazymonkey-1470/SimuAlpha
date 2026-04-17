import { motion } from 'framer-motion';

const cols = ['Bloomberg', 'Seeking Alpha', 'DIY Research', 'SimuAlpha'];
const rows = [
  { label: 'Full S&P 500 scored daily',       vals: ['✓', '—', '—', '✓'] },
  { label: 'Proprietary 0–100 score',          vals: ['—', 'Analyst ratings', '—', '✓'] },
  { label: 'Super Investors tracked',          vals: ['Manual', '—', 'Manual', 'Automated'] },
  { label: 'Congressional trade monitoring',   vals: ['—', '—', '—', 'Committee-weighted'] },
  { label: 'AI-written investment theses',     vals: ['—', 'Human opinions', '—', 'Per stock'] },
  { label: 'Multi-layer consensus signal',     vals: ['—', '—', '—', '4-layer'] },
  { label: 'Elliott Wave auto-detection',      vals: ['—', '—', '—', '✓'] },
  { label: 'Position sizing + DCA plan',       vals: ['—', '—', '—', '5-tranche'] },
];
const costs = ['$2,000+/mo', '$25/mo', 'Your time', '$10/mo'];

export default function CompareTable() {
  return (
    <section id="compare" style={{ padding: '80px 24px', background: 'var(--bg-secondary)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          style={{ textAlign: 'center', marginBottom: 44 }}
        >
          <h2 style={{
            fontFamily: 'Cormorant Garamond', fontSize: 'clamp(28px, 4vw, 48px)',
            fontWeight: 300, color: 'var(--text-primary)', marginBottom: 10,
          }}>
            How Does It Stack Up?
          </h2>
          <p style={{
            fontFamily: 'IBM Plex Mono', fontSize: 11,
            color: 'var(--text-dim)', letterSpacing: '0.04em',
          }}>
            Side-by-side with what professional and retail investors actually use.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
        >
          <table style={{
            width: '100%', borderCollapse: 'collapse', minWidth: 640,
            fontFamily: 'IBM Plex Mono', fontSize: 11,
          }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left', width: '32%' }}>Capability</th>
                {cols.map((c, i) => (
                  <th key={c} style={{ ...th, color: i === 3 ? 'var(--signal-green)' : 'var(--text-dim)',
                    background: i === 3 ? 'rgba(0,232,122,0.04)' : 'transparent',
                    borderLeft: i === 3 ? '1px solid rgba(0,232,122,0.2)' : undefined,
                    borderRight: i === 3 ? '1px solid rgba(0,232,122,0.2)' : undefined,
                  }}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={row.label} style={{ background: ri % 2 === 0 ? 'var(--bg-card)' : 'transparent' }}>
                  <td style={{ ...td, color: 'var(--text-secondary)' }}>{row.label}</td>
                  {row.vals.map((v, vi) => (
                    <td key={vi} style={{
                      ...td, textAlign: 'center',
                      color: vi === 3 ? 'var(--signal-green)' : v === '✓' ? 'var(--text-secondary)' : 'var(--text-dim)',
                      background: vi === 3 ? 'rgba(0,232,122,0.03)' : 'transparent',
                      borderLeft: vi === 3 ? '1px solid rgba(0,232,122,0.15)' : undefined,
                      borderRight: vi === 3 ? '1px solid rgba(0,232,122,0.15)' : undefined,
                      fontWeight: vi === 3 ? 500 : 400,
                    }}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
              <tr style={{ borderTop: '1px solid var(--border-light)' }}>
                <td style={{ ...td, color: 'var(--text-primary)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 10 }}>Monthly Cost</td>
                {costs.map((c, i) => (
                  <td key={i} style={{
                    ...td, textAlign: 'center', fontWeight: 600,
                    color: i === 3 ? 'var(--signal-green)' : 'var(--text-secondary)',
                    background: i === 3 ? 'rgba(0,232,122,0.05)' : 'transparent',
                    borderLeft: i === 3 ? '1px solid rgba(0,232,122,0.2)' : undefined,
                    borderRight: i === 3 ? '1px solid rgba(0,232,122,0.2)' : undefined,
                    fontSize: i === 3 ? 14 : 11,
                    fontFamily: i === 3 ? 'Cormorant Garamond' : 'IBM Plex Mono',
                  }}>
                    {c}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </motion.div>
      </div>
    </section>
  );
}

const th = {
  padding: '12px 16px', borderBottom: '1px solid var(--border)',
  letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: 10,
  color: 'var(--text-dim)', fontWeight: 500,
};
const td = { padding: '11px 16px', borderBottom: '1px solid var(--border)' };
