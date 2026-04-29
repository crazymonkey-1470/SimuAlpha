import { motion } from 'framer-motion';

const rows = [
  { label: 'Proprietary 0–100 verdict score',  bb: '—',     sa: '—',           us: '✓ TLI v2' },
  { label: '4-layer cross-source consensus',   bb: '—',     sa: '—',           us: '✓ Full-Stack' },
  { label: 'Elliott Wave entry detection',     bb: 'Manual', sa: '—',           us: '✓ Automated' },
  { label: 'AI-generated investment thesis',   bb: '—',     sa: 'Per-article', us: '✓ Per-ticker' },
  { label: 'Monthly cost',                     bb: '$2,000', sa: '$239',        us: '$10' },
];

const s = {
  section: { padding: '0 24px 96px' },
  inner: { maxWidth: 1100, margin: '0 auto' },
  title: {
    fontFamily: 'Cormorant Garamond', fontSize: 'clamp(32px, 5vw, 48px)',
    fontWeight: 300, color: 'var(--text-primary)', lineHeight: 1,
    margin: '0 0 12px', textAlign: 'center',
  },
  accent: { color: 'var(--signal-green)', fontStyle: 'italic' },
  subtitle: {
    fontFamily: 'IBM Plex Mono', fontSize: 13, color: 'var(--text-secondary)',
    textAlign: 'center', maxWidth: 560, margin: '0 auto 56px', lineHeight: 1.8,
  },
  wrap: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, overflow: 'hidden',
  },
  scroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: {
    width: '100%', borderCollapse: 'collapse',
    fontFamily: 'IBM Plex Mono', minWidth: 640,
  },
  th: {
    textAlign: 'left', padding: '18px 24px',
    borderBottom: '1px solid var(--border)',
    fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
    color: 'var(--text-dim)', fontWeight: 400,
    background: 'var(--bg-secondary)',
  },
  thUs: {
    textAlign: 'left', padding: '18px 24px',
    borderBottom: '1px solid var(--border)',
    fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
    fontWeight: 400,
    background: 'rgba(0,232,122,0.08)', color: 'var(--signal-green)',
  },
  td: {
    textAlign: 'left', padding: '18px 24px',
    borderBottom: '1px solid var(--border)', fontSize: 12,
    color: 'var(--text-primary)',
  },
  tdNo: {
    textAlign: 'left', padding: '18px 24px',
    borderBottom: '1px solid var(--border)', fontSize: 12,
    color: 'var(--text-dim)',
  },
  tdUs: {
    textAlign: 'left', padding: '18px 24px',
    borderBottom: '1px solid var(--border)', fontSize: 12,
    color: 'var(--signal-green)', background: 'rgba(0,232,122,0.04)',
  },
};

export default function CompareTable() {
  return (
    <section id="compare" style={s.section}>
      <div style={s.inner}>
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          style={s.title}
        >
          Bloomberg charges $2,000.<br />
          <span style={s.accent}>SimuAlpha is $10.</span>
        </motion.h2>
        <p style={s.subtitle}>
          Not a terminal. Not a newsletter. A verdict engine built for retail.
        </p>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          style={s.wrap}
        >
          <div style={s.scroll} className="table-wrap">
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Capability</th>
                  <th style={s.th}>Bloomberg</th>
                  <th style={s.th}>Seeking Alpha</th>
                  <th style={s.thUs}>SimuAlpha</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isLast = i === rows.length - 1;
                  const baseTd = { ...s.td, ...(isLast ? { borderBottom: 'none' } : {}) };
                  const baseNo = { ...s.tdNo, ...(isLast ? { borderBottom: 'none' } : {}) };
                  const baseUs = { ...s.tdUs, ...(isLast ? { borderBottom: 'none' } : {}) };
                  return (
                    <tr key={r.label}>
                      <td style={baseTd}>{r.label}</td>
                      <td style={baseNo}>{r.bb}</td>
                      <td style={baseNo}>{r.sa}</td>
                      <td style={baseUs}>{r.us}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
