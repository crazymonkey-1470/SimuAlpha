import { motion } from 'framer-motion';

const PATREON_URL = import.meta.env.VITE_PATREON_URL || 'https://www.patreon.com/simualpha';

const tiers = [
  {
    name: 'Free',
    price: '$0',
    features: ['Top 10 scored stocks', 'Basic screener access', 'Weekly digest', 'Signal hierarchy view'],
    cta: 'Get Started',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$10',
    period: '/mo',
    features: ['Full screener — 500+ stocks', 'SAIN 4-layer consensus', 'Super investor tracking', 'AI-written theses', 'Unlimited watchlist', 'Custom alerts'],
    cta: 'Join on Patreon',
    highlight: true,
  },
  {
    name: 'Institutional',
    price: '$79',
    period: '/mo',
    features: ['Everything in Pro', 'API access', 'Backtesting dashboard', 'Priority agent analysis', 'PDF report export'],
    cta: 'Contact Us',
    highlight: false,
  },
];

export default function CTAFooter() {
  return (
    <>
      {/* Pricing */}
      <section id="pricing" style={{ padding: '96px 24px', background: 'var(--bg-secondary)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            style={{ textAlign: 'center', marginBottom: 48 }}
          >
            <h2 style={{
              fontFamily: 'Cormorant Garamond', fontSize: 'clamp(28px, 4vw, 52px)',
              fontWeight: 300, color: 'var(--text-primary)', marginBottom: 10,
            }}>
              Plans
            </h2>
            <p style={{
              fontFamily: 'IBM Plex Mono', fontSize: 11,
              color: 'var(--text-dim)', letterSpacing: '0.04em',
            }}>
              Bloomberg charges $2,000/mo. SimuAlpha is $10.
            </p>
          </motion.div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {tiers.map((tier, i) => (
              <motion.div
                key={tier.name}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.07 }}
                style={{
                  background: 'var(--bg-card)',
                  border: tier.highlight ? '2px solid var(--signal-green)' : '1px solid var(--border)',
                  borderRadius: 8, padding: '28px 22px',
                  display: 'flex', flexDirection: 'column', position: 'relative',
                }}
              >
                {tier.highlight && (
                  <div style={{
                    position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--signal-green)', color: '#0c0c0e',
                    fontFamily: 'IBM Plex Mono', fontSize: 9, fontWeight: 700,
                    letterSpacing: '0.12em', padding: '3px 12px', borderRadius: 10,
                  }}>
                    MOST POPULAR
                  </div>
                )}
                <div style={{ fontFamily: 'Cormorant Garamond', fontSize: 20, color: 'var(--text-primary)', marginBottom: 6 }}>{tier.name}</div>
                <div style={{ marginBottom: 20 }}>
                  <span style={{ fontFamily: 'Cormorant Garamond', fontSize: 40, fontWeight: 300, color: 'var(--text-primary)' }}>{tier.price}</span>
                  {tier.period && <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--text-dim)' }}>{tier.period}</span>}
                </div>
                <div style={{ flex: 1, marginBottom: 20 }}>
                  {tier.features.map(f => (
                    <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '3px 0' }}>
                      <span style={{ color: 'var(--signal-green)', fontSize: 10, fontFamily: 'IBM Plex Mono' }}>✓</span>
                      <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--text-secondary)' }}>{f}</span>
                    </div>
                  ))}
                </div>
                <a
                  href={PATREON_URL} target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'block', textAlign: 'center', padding: '11px',
                    fontFamily: 'IBM Plex Mono', fontSize: 11, fontWeight: 600,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    textDecoration: 'none', borderRadius: 6,
                    background: tier.highlight ? 'var(--signal-green)' : 'transparent',
                    color: tier.highlight ? '#0c0c0e' : 'var(--text-secondary)',
                    border: tier.highlight ? 'none' : '1px solid var(--border)',
                  }}
                >
                  {tier.cta}
                </a>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <motion.section
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        style={{ textAlign: 'center', padding: '80px 24px', borderTop: '1px solid var(--border)' }}
      >
        <div style={{
          fontFamily: 'Cormorant Garamond', fontSize: 'clamp(28px, 4vw, 52px)',
          fontWeight: 300, color: 'var(--text-primary)', marginBottom: 28,
        }}>
          Ready to find your next opportunity?
        </div>
        <a
          href={PATREON_URL} target="_blank" rel="noopener noreferrer"
          style={{
            display: 'inline-block', background: 'var(--signal-green)', color: '#0c0c0e',
            fontFamily: 'IBM Plex Mono', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            textDecoration: 'none', padding: '14px 40px', borderRadius: 6,
          }}
        >
          Join on Patreon
        </a>
      </motion.section>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '24px',
        textAlign: 'center',
        fontFamily: 'IBM Plex Mono', fontSize: 10,
        color: 'var(--text-dim)', letterSpacing: '0.04em',
        lineHeight: 1.8,
      }}>
        <div>Built by <span style={{ color: 'var(--text-secondary)' }}>TheSmallBusinessAI</span> · Powered by Claude AI</div>
        <div style={{ marginTop: 4 }}>Not financial advice. Past performance does not guarantee future results. Do your own research.</div>
      </footer>
    </>
  );
}
