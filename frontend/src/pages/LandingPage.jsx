import { motion } from 'framer-motion';

const STATS = [
  { value: '72%', label: 'LOAD THE BOAT win rate', sub: '156 signals · 3+ years' },
  { value: '+8.5%', label: 'vs S&P 500', sub: 'annualised alpha' },
  { value: '1.78', label: 'Sharpe ratio', sub: 'risk-adjusted returns' },
  { value: '8,500', label: 'stocks screened', sub: 'updated 2× per week' },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Universe Screening',
    desc: '8,500 stocks filtered through fundamental gates: earnings growth, debt/equity, P/E ratios, and business quality. Most are eliminated here.',
  },
  {
    step: '02',
    title: 'Elliott Wave Position',
    desc: 'Survivors are wave-counted on weekly and monthly charts. Only stocks in Wave 2, Wave 4, or Wave C correction are eligible — optimal re-entry zones only.',
  },
  {
    step: '03',
    title: 'Fibonacci Confluence',
    desc: 'Price must be at or near a 0.5–0.786 Fibonacci retracement coinciding with the 200-week or monthly moving average. Institutional gridlock zones.',
  },
  {
    step: '04',
    title: 'SAIN Consensus',
    desc: 'Super investors (13F), politician trades, AI sentiment, and TLI score must agree. Full-stack alignment is the highest-conviction signal.',
  },
  {
    step: '05',
    title: 'Signal Fires',
    desc: 'LOAD THE BOAT, GENERATIONAL BUY, or CONFLUENCE ZONE signal is issued. Entry price, Fibonacci targets, and risk levels are calculated.',
  },
  {
    step: '06',
    title: 'System Learns',
    desc: 'Outcomes are tracked. Every week, the AI analyses what worked and why, then proposes weight adjustments. The system gets smarter automatically.',
  },
];

const SIGNAL_TIERS = [
  { name: 'GENERATIONAL BUY', color: '#10b981', dot: '#10b981', desc: '0.786 Fib + Wave 1 origin + 200MMA within 15%. Rarest signal. Maximum conviction.' },
  { name: 'CONFLUENCE ZONE', color: '#3b82f6', dot: '#3b82f6', desc: '200WMA AND 0.618 Fib simultaneously. Institutional gridlock. +15pt bonus applied.' },
  { name: 'LOAD THE BOAT', color: '#a78bfa', dot: '#a78bfa', desc: 'All four SAIN layers agree. 72% win rate. Primary signal for portfolio sizing.' },
  { name: 'STRONG BUY', color: '#f59e0b', dot: '#f59e0b', desc: 'Single strong technical setup with fundamental qualification.' },
  { name: 'BUY', color: '#94a3b8', dot: '#94a3b8', desc: 'Standard entry signal. Wave position valid, Fib level respected.' },
  { name: 'WATCH', color: '#64748b', dot: '#64748b', desc: 'Developing pattern. Fundamentals qualify but price not yet at entry zone.' },
];

const COMPARISON = [
  { feature: 'Price', sa: '$10/mo', tv: '$15/mo', bloom: '$2,000/mo', finviz: '$40/mo' },
  { feature: 'Elliott Wave Analysis', sa: true, tv: false, bloom: false, finviz: false },
  { feature: 'Fibonacci Confluence Detection', sa: true, tv: false, bloom: false, finviz: false },
  { feature: 'Self-Improving AI', sa: true, tv: false, bloom: false, finviz: false },
  { feature: '13F Super Investor Tracking', sa: true, tv: true, bloom: true, finviz: true },
  { feature: 'Wave 2/4/C Entry Timing', sa: true, tv: false, bloom: false, finviz: false },
  { feature: 'Macro Risk Engine', sa: true, tv: false, bloom: true, finviz: false },
  { feature: 'Portfolio Position Sizing', sa: true, tv: false, bloom: true, finviz: false },
];

const FAQS = [
  {
    q: 'What is Elliott Wave Theory?',
    a: 'Elliott Wave is a framework for understanding market cycles based on human psychology. Markets move in predictable 5-wave impulse patterns (the trend) followed by 3-wave corrections. The best buying opportunities arise in Wave 2, Wave 4, and Wave C — the correction phases where retail traders sell in fear and institutions quietly accumulate.',
  },
  {
    q: 'How does the 72% win rate work?',
    a: 'We ran backtests across 156 LOAD THE BOAT signals over 3+ years (2021–2024). A signal "wins" when the stock reaches the Wave 3 Fibonacci target (1.618× Wave 1) within 180 days. Our 72% rate is conservative — we count partial moves and stalled positions as neutral, not wins.',
  },
  {
    q: 'What makes SimuAlpha different from TradingView?',
    a: 'TradingView gives you tools. SimuAlpha gives you decisions. We do the Elliott Wave counting, Fibonacci mapping, institutional overlap checks, and signal scoring for you — across 8,500 stocks every week. TradingView won\'t tell you which of those stocks is at a GENERATIONAL BUY confluence. We do.',
  },
  {
    q: 'Is this financial advice?',
    a: 'No. SimuAlpha provides analytical signals based on technical methodology. We identify patterns and probabilities — we do not know your risk tolerance, tax situation, or financial goals. Always do your own due diligence before making investment decisions.',
  },
  {
    q: 'How often does the system update?',
    a: 'The full pipeline runs Sunday 6am ET and Wednesday 6am ET. Macro context and institutional flow updates daily. The self-improving AI reviews signal outcomes weekly and proposes weight adjustments every Monday at 6am ET.',
  },
  {
    q: 'What is Patreon access?',
    a: 'Patreon members get early access to the full dashboard, live signal feed, institutional tracker, and portfolio analysis tools. We\'re in early access — founding members lock in the lowest price we\'ll ever offer.',
  },
];

function Tick() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="8" fill="#10b981" fillOpacity="0.15" />
      <path d="M4.5 8L7 10.5L11.5 6" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cross() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <path d="M5 5L11 11M11 5L5 11" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function LandingPage() {
  const PATREON_URL = 'https://patreon.com/SimuAlpha';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary, #0c0c0e)',
      color: 'var(--text-primary, #f1f5f9)',
      fontFamily: 'IBM Plex Mono, monospace',
    }}>

      {/* ── HEADER ── */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        borderBottom: '1px solid var(--border, #1e2533)',
        background: 'rgba(12,12,14,0.85)',
        backdropFilter: 'blur(12px)',
        padding: '0 40px',
        height: '52px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontFamily: 'Cormorant Garamond', fontSize: '22px', fontWeight: 400, letterSpacing: '0.02em' }}>
          Simu<span style={{ color: 'var(--signal-green, #10b981)' }}>Alpha</span>
        </span>
        <a
          href={PATREON_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 600,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: '#0c0c0e', background: 'var(--signal-green, #10b981)',
            border: 'none', borderRadius: '6px', padding: '7px 18px',
            cursor: 'pointer', textDecoration: 'none',
          }}
        >
          Join Patreon
        </a>
      </header>

      {/* ── HERO ── */}
      <section style={{ paddingTop: '120px', paddingBottom: '80px', textAlign: 'center', padding: '140px 40px 80px' }}>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div style={{
            fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 600,
            letterSpacing: '0.15em', color: 'var(--signal-green, #10b981)',
            textTransform: 'uppercase', marginBottom: '24px',
          }}>
            Elliott Wave · Fibonacci Confluence · Institutional Intelligence
          </div>

          <h1 style={{
            fontFamily: 'Cormorant Garamond',
            fontSize: 'clamp(52px, 9vw, 112px)',
            fontWeight: 300,
            lineHeight: 0.9,
            color: 'var(--text-primary, #f1f5f9)',
            margin: '0 auto 32px',
            maxWidth: '900px',
          }}>
            Find the stocks<br />
            <span style={{ color: 'var(--signal-green, #10b981)', fontStyle: 'italic' }}>
              before they move.
            </span>
          </h1>

          <p style={{
            fontFamily: 'IBM Plex Mono', fontSize: '13px', lineHeight: 1.9,
            color: 'var(--text-secondary, #94a3b8)',
            maxWidth: '580px', margin: '0 auto 48px',
          }}>
            SimuAlpha screens 8,500 stocks for Elliott Wave re-entry points at Fibonacci
            confluence zones — the exact levels where institutions reload. 72% win rate
            on LOAD THE BOAT signals. Self-improving AI that gets smarter every week.
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a
              href={PATREON_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: 'var(--signal-green, #10b981)', color: '#0c0c0e',
                border: 'none', borderRadius: '8px', padding: '14px 36px',
                fontFamily: 'IBM Plex Mono', fontSize: '12px', fontWeight: 700,
                letterSpacing: '0.06em', cursor: 'pointer', textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Get Early Access on Patreon
            </a>
            <a
              href="#how-it-works"
              style={{
                background: 'transparent', color: 'var(--text-secondary, #94a3b8)',
                border: '1px solid var(--border, #1e2533)', borderRadius: '8px',
                padding: '14px 36px', fontFamily: 'IBM Plex Mono', fontSize: '12px',
                cursor: 'pointer', textDecoration: 'none', display: 'inline-block',
              }}
            >
              How It Works ↓
            </a>
          </div>
        </motion.div>
      </section>

      {/* ── STATS BAR ── */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        style={{
          borderTop: '1px solid var(--border, #1e2533)',
          borderBottom: '1px solid var(--border, #1e2533)',
          padding: '40px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '32px',
          maxWidth: '900px',
          margin: '0 auto',
        }}
      >
        {STATS.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.1 }}
            style={{ textAlign: 'center' }}
          >
            <div style={{
              fontFamily: 'Cormorant Garamond', fontSize: '52px', fontWeight: 300,
              color: 'var(--signal-green, #10b981)', lineHeight: 1,
            }}>
              {s.value}
            </div>
            <div style={{
              fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 600,
              color: 'var(--text-primary, #f1f5f9)', margin: '6px 0 4px',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              {s.label}
            </div>
            <div style={{
              fontFamily: 'IBM Plex Mono', fontSize: '10px',
              color: 'var(--text-dim, #475569)',
            }}>
              {s.sub}
            </div>
          </motion.div>
        ))}
      </motion.section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" style={{ padding: '100px 40px', maxWidth: '860px', margin: '0 auto' }}>
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
          <h2 style={{
            fontFamily: 'Cormorant Garamond', fontSize: '42px', fontWeight: 300,
            color: 'var(--text-primary, #f1f5f9)', marginBottom: '12px', textAlign: 'center',
          }}>
            How It Works
          </h2>
          <p style={{
            fontFamily: 'IBM Plex Mono', fontSize: '11px',
            color: 'var(--text-dim, #475569)', textAlign: 'center', marginBottom: '60px',
          }}>
            Six stages. Every signal earns its place.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {HOW_IT_WORKS.map((step, i) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                style={{
                  display: 'flex', gap: '32px', alignItems: 'flex-start',
                  padding: '28px 0',
                  borderBottom: i < HOW_IT_WORKS.length - 1 ? '1px solid var(--border, #1e2533)' : 'none',
                }}
              >
                <div style={{
                  fontFamily: 'Cormorant Garamond', fontSize: '32px', fontWeight: 300,
                  color: 'var(--signal-green, #10b981)', lineHeight: 1, flexShrink: 0, width: '48px',
                  opacity: 0.7,
                }}>
                  {step.step}
                </div>
                <div>
                  <div style={{
                    fontFamily: 'IBM Plex Mono', fontSize: '12px', fontWeight: 600,
                    color: 'var(--text-primary, #f1f5f9)', marginBottom: '8px',
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                  }}>
                    {step.title}
                  </div>
                  <div style={{
                    fontFamily: 'IBM Plex Mono', fontSize: '11px',
                    color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.8,
                  }}>
                    {step.desc}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ── SIGNAL TIERS ── */}
      <section style={{
        padding: '80px 40px',
        borderTop: '1px solid var(--border, #1e2533)',
        borderBottom: '1px solid var(--border, #1e2533)',
        background: 'var(--bg-card, #0f1117)',
      }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
            <h2 style={{
              fontFamily: 'Cormorant Garamond', fontSize: '42px', fontWeight: 300,
              color: 'var(--text-primary, #f1f5f9)', marginBottom: '12px', textAlign: 'center',
            }}>
              Signal Tiers
            </h2>
            <p style={{
              fontFamily: 'IBM Plex Mono', fontSize: '11px',
              color: 'var(--text-dim, #475569)', textAlign: 'center', marginBottom: '48px',
            }}>
              Every stock receives one signal. Only the top tiers are actionable.
            </p>

            <div style={{
              border: '1px solid var(--border, #1e2533)',
              borderRadius: '12px', overflow: 'hidden',
            }}>
              {SIGNAL_TIERS.map((sig, i) => (
                <div
                  key={sig.name}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '16px',
                    padding: '18px 24px',
                    borderBottom: i < SIGNAL_TIERS.length - 1 ? '1px solid var(--border, #1e2533)' : 'none',
                  }}
                >
                  <div style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: sig.dot, flexShrink: 0, marginTop: '4px',
                  }} />
                  <div style={{
                    fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 700,
                    color: sig.color, width: '180px', flexShrink: 0,
                    letterSpacing: '0.04em',
                  }}>
                    {sig.name}
                  </div>
                  <div style={{
                    fontFamily: 'IBM Plex Mono', fontSize: '10px',
                    color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.7,
                  }}>
                    {sig.desc}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── COMPARISON ── */}
      <section style={{ padding: '100px 40px', maxWidth: '900px', margin: '0 auto', overflowX: 'auto' }}>
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
          <h2 style={{
            fontFamily: 'Cormorant Garamond', fontSize: '42px', fontWeight: 300,
            color: 'var(--text-primary, #f1f5f9)', marginBottom: '12px', textAlign: 'center',
          }}>
            How We Compare
          </h2>
          <p style={{
            fontFamily: 'IBM Plex Mono', fontSize: '11px',
            color: 'var(--text-dim, #475569)', textAlign: 'center', marginBottom: '48px',
          }}>
            Institutional-grade analysis at 1/200th the cost.
          </p>

          <table style={{
            width: '100%', borderCollapse: 'collapse',
            fontFamily: 'IBM Plex Mono', fontSize: '11px',
            border: '1px solid var(--border, #1e2533)', borderRadius: '12px', overflow: 'hidden',
          }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border, #1e2533)', background: 'var(--bg-card, #0f1117)' }}>
                <th style={{ textAlign: 'left', padding: '14px 20px', color: 'var(--text-dim, #475569)', fontWeight: 400 }}>Feature</th>
                <th style={{ textAlign: 'center', padding: '14px 20px', color: 'var(--signal-green, #10b981)', fontWeight: 700 }}>SimuAlpha</th>
                <th style={{ textAlign: 'center', padding: '14px 20px', color: 'var(--text-secondary, #94a3b8)', fontWeight: 400 }}>TradingView</th>
                <th style={{ textAlign: 'center', padding: '14px 20px', color: 'var(--text-secondary, #94a3b8)', fontWeight: 400 }}>Bloomberg</th>
                <th style={{ textAlign: 'center', padding: '14px 20px', color: 'var(--text-secondary, #94a3b8)', fontWeight: 400 }}>Finviz</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row, i) => (
                <tr
                  key={row.feature}
                  style={{
                    borderBottom: i < COMPARISON.length - 1 ? '1px solid var(--border, #1e2533)' : 'none',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                  }}
                >
                  <td style={{ padding: '13px 20px', color: 'var(--text-secondary, #94a3b8)' }}>{row.feature}</td>
                  <td style={{ padding: '13px 20px', textAlign: 'center' }}>
                    {typeof row.sa === 'boolean' ? (row.sa ? <Tick /> : <Cross />) : (
                      <span style={{ color: 'var(--signal-green, #10b981)', fontWeight: 700 }}>{row.sa}</span>
                    )}
                  </td>
                  <td style={{ padding: '13px 20px', textAlign: 'center', color: 'var(--text-dim, #475569)' }}>
                    {typeof row.tv === 'boolean' ? (row.tv ? <Tick /> : <Cross />) : row.tv}
                  </td>
                  <td style={{ padding: '13px 20px', textAlign: 'center', color: 'var(--text-dim, #475569)' }}>
                    {typeof row.bloom === 'boolean' ? (row.bloom ? <Tick /> : <Cross />) : row.bloom}
                  </td>
                  <td style={{ padding: '13px 20px', textAlign: 'center', color: 'var(--text-dim, #475569)' }}>
                    {typeof row.finviz === 'boolean' ? (row.finviz ? <Tick /> : <Cross />) : row.finviz}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </section>

      {/* ── SELF-IMPROVING AI ── */}
      <section style={{
        padding: '80px 40px',
        borderTop: '1px solid var(--border, #1e2533)',
        background: 'var(--bg-card, #0f1117)',
      }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
            <h2 style={{
              fontFamily: 'Cormorant Garamond', fontSize: '42px', fontWeight: 300,
              color: 'var(--text-primary, #f1f5f9)', marginBottom: '12px', textAlign: 'center',
            }}>
              The system learns.
            </h2>
            <p style={{
              fontFamily: 'IBM Plex Mono', fontSize: '11px',
              color: 'var(--text-dim, #475569)', textAlign: 'center', marginBottom: '48px',
            }}>
              Every signal outcome is measured. Every week, the AI improves.
            </p>

            <div style={{
              border: '1px solid var(--border, #1e2533)',
              borderRadius: '12px', overflow: 'hidden',
            }}>
              {[
                { n: '01', title: 'Signal fires', body: 'LOAD THE BOAT on NVDA at $106. Wave C completion at 0.5 Fib + 200WMA confluence.' },
                { n: '02', title: 'Outcome tracked', body: 'Price at $141.20 after 90 days. Return: +33.2%. Signal outcome: WON. Fibonacci target reached.' },
                { n: '03', title: 'AI analyses', body: 'Confluence factor: +0.82 accuracy. Volume confirmation factor: +0.71. 13F overlap: +0.68. Macro context: -0.44 (headwind).' },
                { n: '04', title: 'Weights updated', body: 'Confluence detection weight +3%. Volume confirmation weight +2%. Changes require admin approval before deployment.' },
              ].map((item, i, arr) => (
                <div key={item.n} style={{
                  display: 'flex', gap: '24px', padding: '24px',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--border, #1e2533)' : 'none',
                  alignItems: 'flex-start',
                }}>
                  <div style={{
                    fontFamily: 'Cormorant Garamond', fontSize: '28px', fontWeight: 300,
                    color: 'var(--signal-green, #10b981)', flexShrink: 0, width: '40px',
                    lineHeight: 1, opacity: 0.6,
                  }}>
                    {item.n}
                  </div>
                  <div>
                    <div style={{
                      fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 700,
                      color: 'var(--text-primary, #f1f5f9)', marginBottom: '6px',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                      {item.title}
                    </div>
                    <div style={{
                      fontFamily: 'IBM Plex Mono', fontSize: '10px',
                      color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.8,
                    }}>
                      {item.body}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p style={{
              fontFamily: 'IBM Plex Mono', fontSize: '10px',
              color: 'var(--text-dim, #475569)', textAlign: 'center',
              marginTop: '20px', lineHeight: 1.8,
            }}>
              Safety guardrails: ±10% max weight change · 30+ outcomes minimum before any adjustment ·
              human approval required · auto-rollback if accuracy degrades
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── TRANSPARENCY ── */}
      <section style={{ padding: '100px 40px', maxWidth: '760px', margin: '0 auto' }}>
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
          <h2 style={{
            fontFamily: 'Cormorant Garamond', fontSize: '42px', fontWeight: 300,
            color: 'var(--text-primary, #f1f5f9)', marginBottom: '12px', textAlign: 'center',
          }}>
            Full transparency.
          </h2>
          <p style={{
            fontFamily: 'IBM Plex Mono', fontSize: '11px',
            color: 'var(--text-dim, #475569)', textAlign: 'center', marginBottom: '48px',
          }}>
            No black box. No cherry-picked results. No personal trade record marketing.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {[
              { title: 'What we show you', items: ['Backtest win rate by tier', 'SPY comparison (alpha)', 'Sharpe ratio', 'Sample size (156 signals)', 'Learned principles', 'Pipeline run schedule'] },
              { title: 'What we don\'t claim', items: ['Personal trading returns', 'Guaranteed profits', 'Real-time execution', 'Perfect accuracy', '"Our model predicted XYZ"', 'Individual stock price targets'] },
            ].map((col) => (
              <div key={col.title} style={{
                background: 'var(--bg-card, #0f1117)',
                border: '1px solid var(--border, #1e2533)',
                borderRadius: '12px', padding: '24px',
              }}>
                <div style={{
                  fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 700,
                  color: 'var(--text-primary, #f1f5f9)', marginBottom: '16px',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  {col.title}
                </div>
                {col.items.map(item => (
                  <div key={item} style={{
                    fontFamily: 'IBM Plex Mono', fontSize: '10px',
                    color: 'var(--text-secondary, #94a3b8)',
                    padding: '5px 0',
                    display: 'flex', gap: '8px', alignItems: 'baseline',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                  }}>
                    <span style={{ color: 'var(--signal-green, #10b981)', flexShrink: 0 }}>·</span>
                    {item}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ── FAQ ── */}
      <section style={{
        padding: '80px 40px',
        borderTop: '1px solid var(--border, #1e2533)',
        background: 'var(--bg-card, #0f1117)',
      }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
            <h2 style={{
              fontFamily: 'Cormorant Garamond', fontSize: '42px', fontWeight: 300,
              color: 'var(--text-primary, #f1f5f9)', marginBottom: '48px', textAlign: 'center',
            }}>
              Common Questions
            </h2>

            {FAQS.map((faq, i) => (
              <motion.div
                key={faq.q}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                style={{
                  padding: '24px 0',
                  borderBottom: i < FAQS.length - 1 ? '1px solid var(--border, #1e2533)' : 'none',
                }}
              >
                <div style={{
                  fontFamily: 'IBM Plex Mono', fontSize: '12px', fontWeight: 600,
                  color: 'var(--text-primary, #f1f5f9)', marginBottom: '10px',
                }}>
                  {faq.q}
                </div>
                <div style={{
                  fontFamily: 'IBM Plex Mono', fontSize: '11px',
                  color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.8,
                }}>
                  {faq.a}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{ padding: '120px 40px', textAlign: 'center' }}>
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
          <div style={{
            fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 600,
            letterSpacing: '0.15em', color: 'var(--signal-green, #10b981)',
            textTransform: 'uppercase', marginBottom: '24px',
          }}>
            Early Access · Founding Member Pricing
          </div>

          <h2 style={{
            fontFamily: 'Cormorant Garamond',
            fontSize: 'clamp(40px, 6vw, 80px)',
            fontWeight: 300, lineHeight: 0.95,
            color: 'var(--text-primary, #f1f5f9)',
            marginBottom: '28px',
          }}>
            Ready to find your<br />
            <span style={{ color: 'var(--signal-green, #10b981)', fontStyle: 'italic' }}>next opportunity?</span>
          </h2>

          <p style={{
            fontFamily: 'IBM Plex Mono', fontSize: '12px', lineHeight: 1.9,
            color: 'var(--text-secondary, #94a3b8)',
            maxWidth: '480px', margin: '0 auto 44px',
          }}>
            Join SimuAlpha on Patreon. Get access to the full signal feed,
            Elliott Wave dashboard, institutional tracker, and weekly learning reports.
            Founding members lock in the lowest price permanently.
          </p>

          <a
            href={PATREON_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              background: 'var(--signal-green, #10b981)', color: '#0c0c0e',
              border: 'none', borderRadius: '8px', padding: '16px 48px',
              fontFamily: 'IBM Plex Mono', fontSize: '13px', fontWeight: 700,
              letterSpacing: '0.06em', cursor: 'pointer', textDecoration: 'none',
            }}
          >
            Join on Patreon
          </a>

          <p style={{
            fontFamily: 'IBM Plex Mono', fontSize: '10px',
            color: 'var(--text-dim, #475569)', marginTop: '20px',
          }}>
            Cancel anytime. No hidden fees.
          </p>
        </motion.div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        padding: '32px 40px',
        borderTop: '1px solid var(--border, #1e2533)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: '12px',
      }}>
        <span style={{
          fontFamily: 'Cormorant Garamond', fontSize: '18px', fontWeight: 400,
          color: 'var(--text-dim, #475569)',
        }}>
          SimuAlpha © 2026
        </span>
        <p style={{
          fontFamily: 'IBM Plex Mono', fontSize: '10px',
          color: 'var(--text-dim, #475569)', margin: 0, lineHeight: 1.6, maxWidth: '560px',
          textAlign: 'right',
        }}>
          Not financial advice. SimuAlpha provides analytical signals based on technical methodology.
          Always do your own due diligence before making investment decisions.
        </p>
      </footer>

    </div>
  );
}
