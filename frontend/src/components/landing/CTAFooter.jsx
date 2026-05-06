import { motion } from 'framer-motion';

const ABOUT_URL = '/about';

const tiers = [
  {
    name: 'Free',
    price: '$0',
    period: '/ forever',
    tag: 'See the system work. No card required.',
    features: [
      { ok: true,  text: 'Daily top-5 Load-the-Boat signals' },
      { ok: true,  text: 'TLI score for 50 tickers' },
      { ok: true,  text: 'Market risk banner' },
      { ok: false, text: 'Full screener access' },
      { ok: false, text: 'Full-Stack Consensus alerts' },
    ],
    featured: false,
  },
  {
    name: 'Patreon',
    price: '$10',
    period: '/ month',
    tag: 'Everything. For the price of a sandwich.',
    features: [
      { ok: true, text: 'Full screener · all 500 tickers' },
      { ok: true, text: 'All 4 intelligence layers' },
      { ok: true, text: 'Full-Stack Consensus alerts' },
      { ok: true, text: 'AI deep-dive on any ticker' },
      { ok: true, text: 'Backtest any signal · 10 yrs' },
    ],
    featured: true,
  },
  {
    name: 'Institutional',
    price: 'Talk',
    period: '',
    tag: 'API, custom universe, white-label.',
    features: [
      { ok: true, text: 'Everything in Patreon' },
      { ok: true, text: 'REST + WebSocket API' },
      { ok: true, text: 'Custom ticker universe' },
      { ok: true, text: 'Private Slack channel' },
      { ok: true, text: 'Dedicated analyst' },
    ],
    featured: false,
  },
];

const s = {
  pricingSection: { padding: '0 24px 96px' },
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
  pricing: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 16,
  },
  tier: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '32px 28px',
    display: 'flex', flexDirection: 'column', gap: 18,
    position: 'relative',
  },
  tierFeatured: {
    background: 'var(--bg-card)',
    border: '2px solid var(--signal-green)',
    borderRadius: 12,
    padding: '32px 28px',
    display: 'flex', flexDirection: 'column', gap: 18,
    position: 'relative',
  },
  featureBadge: {
    position: 'absolute', top: -10, left: 24,
    fontFamily: 'IBM Plex Mono', fontSize: 9, letterSpacing: '0.14em',
    textTransform: 'uppercase', color: '#0c0c0e',
    background: 'var(--signal-green)',
    padding: '3px 10px', borderRadius: 3,
  },
  tierName: {
    fontFamily: 'IBM Plex Mono', fontSize: 10, letterSpacing: '0.14em',
    textTransform: 'uppercase', color: 'var(--text-dim)',
  },
  tierPrice: { display: 'flex', alignItems: 'baseline', gap: 6 },
  tierPriceN: {
    fontFamily: 'Cormorant Garamond', fontSize: 56, fontWeight: 300,
    color: 'var(--text-primary)', lineHeight: 1,
  },
  tierPriceP: {
    fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--text-secondary)',
  },
  tierTag: {
    fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--text-secondary)',
    lineHeight: 1.7, paddingBottom: 14,
    borderBottom: '1px solid var(--border)',
  },
  features: {
    listStyle: 'none', padding: 0, margin: '0 0 14px',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  featureLi: {
    fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--text-secondary)',
    display: 'flex', gap: 10, lineHeight: 1.5,
  },
  check: { color: 'var(--signal-green)', flexShrink: 0 },
  dash: { color: 'var(--text-dim)', flexShrink: 0 },

  footerCta: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '64px 40px', textAlign: 'center',
    margin: '0 24px 48px', maxWidth: 1100,
  },
  footerWrap: { maxWidth: 1100, margin: '0 auto', padding: '0 24px' },
  footerCtaTitle: {
    fontFamily: 'Cormorant Garamond', fontSize: 'clamp(36px, 6vw, 64px)',
    fontWeight: 300, color: 'var(--text-primary)', lineHeight: 1,
    margin: '0 0 18px',
  },
  footerCtaSub: {
    fontFamily: 'IBM Plex Mono', fontSize: 13, color: 'var(--text-secondary)',
    margin: '0 0 32px',
  },
  ctaBtn: {
    fontFamily: 'IBM Plex Mono', fontSize: 13, fontWeight: 600,
    padding: '14px 32px', borderRadius: 8, letterSpacing: '0.05em',
    textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10,
    background: 'var(--signal-green)', color: '#0c0c0e', border: 'none',
    cursor: 'pointer',
  },

  footer: {
    borderTop: '1px solid var(--border)',
    padding: '32px 24px',
    fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--text-dim)',
    display: 'flex', justifyContent: 'space-between',
    gap: 16, flexWrap: 'wrap',
    maxWidth: 1100, margin: '0 auto',
  },
  disclaim: { maxWidth: 560, lineHeight: 1.7 },
};

export default function CTAFooter() {
  return (
    <>
      {/* ── Pricing ──────────────────────────────────────────── */}
      <section id="pricing" style={s.pricingSection}>
        <div style={s.inner}>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            style={s.title}
          >
            Pricing
          </motion.h2>
          <p style={s.subtitle}>
            Start free. Upgrade when the conviction signals earn their keep.
          </p>

          <div style={s.pricing} className="card-grid">
            {tiers.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                style={t.featured ? s.tierFeatured : s.tier}
              >
                {t.featured && <span style={s.featureBadge}>Most Popular</span>}
                <div style={s.tierName}>{t.name}</div>
                <div style={s.tierPrice}>
                  <span style={s.tierPriceN}>{t.price}</span>
                  {t.period && <span style={s.tierPriceP}>{t.period}</span>}
                </div>
                <div style={s.tierTag}>{t.tag}</div>
                <ul style={s.features}>
                  {t.features.map((f, j) => (
                    <li key={j} style={s.featureLi}>
                      <span style={f.ok ? s.check : s.dash}>{f.ok ? '✓' : '—'}</span>
                      {f.text}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer CTA ──────────────────────────────────────── */}
      <div style={s.footerWrap}>
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          style={{ ...s.footerCta, margin: '0 0 48px' }}
        >
          <h2 style={s.footerCtaTitle}>
            Ready to find your<br />
            next <span style={s.accent}>opportunity?</span>
          </h2>
          <p style={s.footerCtaSub}>
            Start with the free tier. Upgrade when the first Load-the-Boat signal pays for the year.
          </p>
          <a href={ABOUT_URL} style={s.ctaBtn}>
            Learn Our Mission →
          </a>
        </motion.section>
      </div>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer style={s.footer}>
        <div>© {new Date().getFullYear()} SimuAlpha · Built by retail, for retail</div>
        <div style={s.disclaim}>
          Not financial advice. AI-generated analysis for educational purposes only.
          Do your own research before investing.
        </div>
      </footer>
    </>
  );
}
