import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const items = [
  {
    q: 'How is this different from Seeking Alpha or Motley Fool?',
    a: 'They give you opinions. SimuAlpha gives you a system. Every stock receives a quantitative 0–100 score — not one analyst\'s gut feeling. And the algorithm tracks its own accuracy to self-improve.',
  },
  {
    q: 'Do I need to know technical analysis?',
    a: 'No. SimuAlpha runs the Elliott Wave and moving average analysis automatically. You get a plain-English verdict: what to buy, at what price, with what position size.',
  },
  {
    q: 'How do you track politician trades?',
    a: 'Congress members must disclose trades within 45 days under the STOCK Act. We monitor filings in real time and weight them by committee jurisdiction — a Health Committee senator buying pharma is a stronger signal than a random one.',
  },
  {
    q: 'What makes the scoring better than a standard stock screener?',
    a: 'Screeners filter by static metrics. SimuAlpha combines fundamental quality, technical positioning, institutional consensus, congressional activity, AI model signals, and multi-source confluence into one number — then explains the reasoning.',
  },
  {
    q: 'What is the backtested win rate based on?',
    a: '72% win rate measured on highest-conviction signals (score 80+) across historical data. Full accuracy dashboard published to members — every signal and outcome, no cherry-picking.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Membership is managed through Patreon — cancel any time, no penalties, no contracts.',
  },
];

export default function FAQ() {
  const [open, setOpen] = useState(null);

  return (
    <section id="faq" style={{ padding: '96px 24px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          style={{ textAlign: 'center', marginBottom: 48 }}
        >
          <h2 style={{
            fontFamily: 'Cormorant Garamond', fontSize: 'clamp(28px, 4vw, 48px)',
            fontWeight: 300, color: 'var(--text-primary)',
          }}>
            Frequently Asked
          </h2>
        </motion.div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((item, i) => {
            const isOpen = open === i;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  style={{
                    width: '100%', display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', gap: 16, padding: '16px 20px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{
                    fontFamily: 'IBM Plex Mono', fontSize: 12,
                    color: 'var(--text-primary)', lineHeight: 1.5,
                  }}>
                    {item.q}
                  </span>
                  <span style={{
                    fontFamily: 'IBM Plex Mono', fontSize: 16,
                    color: isOpen ? 'var(--signal-green)' : 'var(--text-dim)',
                    flexShrink: 0, transition: 'color 0.15s',
                  }}>
                    {isOpen ? '−' : '+'}
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{
                        padding: '0 20px 16px',
                        fontFamily: 'IBM Plex Mono', fontSize: 11,
                        color: 'var(--text-secondary)', lineHeight: 1.8,
                      }}>
                        {item.a}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
