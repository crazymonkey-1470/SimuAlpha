import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, X, Brain, Users, Activity,
  ChevronDown, ChevronUp, ArrowRight, Trophy, Target,
  FileText, Layers
} from 'lucide-react';

const PATREON_URL = import.meta.env.VITE_PATREON_URL || 'https://www.patreon.com/simualpha';

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────
const fadeUp = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, ease: 'easeOut' },
};

function CTAButton({ children, variant = 'primary', className = '', href = PATREON_URL, ...rest }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-200 px-6 py-3 text-sm sm:text-base';
  const styles = variant === 'primary'
    ? 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:-translate-y-0.5'
    : 'border border-slate-600 text-slate-200 hover:border-slate-400 hover:bg-slate-800/40';
  // In-page anchor links shouldn't open a new tab.
  const isExternal = href && !href.startsWith('#');
  const externalProps = isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  return (
    <a
      href={href}
      {...externalProps}
      className={`${base} ${styles} ${className}`}
      {...rest}
    >
      {children}
    </a>
  );
}

// ────────────────────────────────────────────────────────────────
// Section 1 — Top Nav + Hero
// ────────────────────────────────────────────────────────────────
function TopNav() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-[#0a0e1a]/80 border-b border-slate-800/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <a href="#top" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-white text-sm">
            S
          </div>
          <span className="font-semibold text-white tracking-tight">SimuAlpha</span>
        </a>
        <div className="hidden md:flex items-center gap-7 text-sm text-slate-300">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#compare" className="hover:text-white transition-colors">Compare</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
        </div>
        <CTAButton className="!py-2 !px-4 text-sm">
          Get Access
        </CTAButton>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section id="top" className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 px-4 sm:px-6 overflow-hidden">
      {/* Background grid + glow */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.15),transparent_60%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      <div className="max-w-5xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-xs sm:text-sm text-blue-300 mb-7"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          AI-Powered Stock Discovery Platform
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-[1.05]"
        >
          The Intelligence That Hedge Funds<br className="hidden sm:block" />
          <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Keep Private — Now In Your Hands
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="mt-8 text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed"
        >
          SimuAlpha scans the S&amp;P 500 daily using an AI system that combines
          institutional investor tracking, proprietary scoring, and real-time social
          intelligence — then tells you exactly what deserves attention and why.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mt-10 flex flex-col sm:flex-row gap-3 justify-center items-center"
        >
          <CTAButton>
            Join on Patreon <ArrowRight size={16} />
          </CTAButton>
          <CTAButton href="#features" variant="outline">
            See How It Works
          </CTAButton>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-6 inline-flex items-center gap-2 text-xs text-slate-400"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </span>
          Scanning market now
        </motion.div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────
// Section 2 — Social proof bar
// ────────────────────────────────────────────────────────────────
function SocialProofBar() {
  const items = [
    'S&P 500 Stocks Scored Daily',
    '8 Super Investors Tracked',
    '30+ Intelligence Sources',
    '15 AI Analysis Skills',
    '24/7 Autonomous Scanning',
  ];
  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 border-y border-slate-800/60 bg-slate-900/30">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-center gap-x-6 gap-y-3 sm:gap-x-10 text-xs sm:text-sm text-slate-400">
        {items.map((item, i) => (
          <React.Fragment key={item}>
            <span className="font-medium tracking-wide">{item}</span>
            {i < items.length - 1 && (
              <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-slate-600" />
            )}
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────
// Section 3 — Four Feature Cards
// ────────────────────────────────────────────────────────────────
function Features() {
  const cards = [
    {
      icon: <Users size={22} />,
      iconBg: 'from-blue-500/20 to-blue-600/10',
      iconColor: 'text-blue-400',
      title: 'Institutional Intelligence',
      body: 'Track what Berkshire, Druckenmiller, Tepper, Tiger Global, and 4 more are buying or selling quarterly. See when 3+ funds converge on the same stock.',
    },
    {
      icon: <Activity size={22} />,
      iconBg: 'from-indigo-500/20 to-indigo-600/10',
      iconColor: 'text-indigo-400',
      title: 'Proprietary Scoring Engine',
      body: 'Every stock gets a 0-100 score combining fundamental quality, technical positioning, and multi-signal confluence. The algorithm filters hundreds of stocks down to the handful worth your attention.',
    },
    {
      icon: <Brain size={22} />,
      iconBg: 'from-purple-500/20 to-purple-600/10',
      iconColor: 'text-purple-400',
      title: 'Social Intelligence Network',
      body: 'Monitors congressional stock trades (committee-weighted), AI investment portfolios, corporate insider buys, and 30+ real-time sources. When all layers agree — that\u2019s our highest conviction signal.',
    },
    {
      icon: <FileText size={22} />,
      iconBg: 'from-cyan-500/20 to-cyan-600/10',
      iconColor: 'text-cyan-400',
      title: 'AI-Written Research',
      body: 'Every high-scoring stock gets an institutional-grade investment thesis analyzing it from 9 different legendary investor perspectives. Not generic. Specific price targets, risk assessment, and position sizing.',
    },
  ];

  return (
    <section id="features" className="py-20 sm:py-28 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div {...fadeUp} className="text-center mb-14">
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">
            Four Layers of Intelligence.<br />
            <span className="text-slate-400">One Clear Answer.</span>
          </h2>
          <p className="mt-4 text-slate-400 max-w-2xl mx-auto">
            Most platforms give you data. SimuAlpha gives you a verdict — built from signals
            that institutions pay millions to access.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
          {cards.map((c, i) => (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="group relative rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/80 to-slate-900/40 p-6 sm:p-7 hover:border-slate-700 transition-colors"
            >
              <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${c.iconBg} ${c.iconColor} mb-5 ring-1 ring-inset ring-white/5`}>
                {c.icon}
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">{c.title}</h3>
              <p className="text-sm sm:text-base text-slate-400 leading-relaxed">{c.body}</p>
            </motion.div>
          ))}
        </div>

        <motion.div {...fadeUp} className="mt-12 text-center">
          <CTAButton>
            Get the Full Stack <ArrowRight size={16} />
          </CTAButton>
        </motion.div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────
// Section 4 — Signal Hierarchy
// ────────────────────────────────────────────────────────────────
function SignalHierarchy() {
  const tiers = [
    { icon: '\u{1F3C6}', name: 'FULL STACK CONSENSUS', desc: 'All 4 intelligence layers agree', color: 'from-amber-400 to-yellow-500', text: 'text-amber-300' },
    { icon: '\u{1F3AF}', name: 'CONFLUENCE ZONE', desc: 'Multiple technical supports converge', color: 'from-cyan-400 to-blue-500', text: 'text-cyan-300' },
    { icon: '\u{1F7E2}', name: 'LOAD THE BOAT', desc: 'Score 85-100, maximum conviction', color: 'from-emerald-500 to-green-600', text: 'text-emerald-300' },
    { icon: '\u{1F7E2}', name: 'ACCUMULATE', desc: 'Score 70-84, scale in', color: 'from-emerald-600 to-emerald-700', text: 'text-emerald-200' },
    { icon: '\u{1F7E1}', name: 'WATCHLIST', desc: 'Score 55-69, setup forming', color: 'from-yellow-500 to-amber-600', text: 'text-yellow-300' },
    { icon: '\u{1F535}', name: 'HOLD', desc: 'Score 40-54, maintain position', color: 'from-blue-500 to-indigo-600', text: 'text-blue-300' },
    { icon: '\u{1F534}', name: 'AVOID', desc: 'Below 40, does not meet criteria', color: 'from-rose-500 to-red-600', text: 'text-rose-300' },
  ];

  return (
    <section className="py-20 sm:py-28 px-4 sm:px-6 bg-gradient-to-b from-transparent via-slate-900/40 to-transparent">
      <div className="max-w-4xl mx-auto">
        <motion.div {...fadeUp} className="text-center mb-12">
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">
            Seven Signals. Zero Ambiguity.
          </h2>
          <p className="mt-4 text-slate-400 max-w-xl mx-auto">
            Every stock in the universe lands in one of seven tiers. You always know what to do.
          </p>
        </motion.div>

        <div className="space-y-2 sm:space-y-3">
          {tiers.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/40 px-4 sm:px-6 py-4 hover:border-slate-700 transition-colors"
            >
              <span className="text-2xl sm:text-3xl flex-shrink-0">{t.icon}</span>
              <div className={`hidden sm:block w-1 h-10 rounded-full bg-gradient-to-b ${t.color} flex-shrink-0`} />
              <div className="flex-1 min-w-0">
                <div className={`font-bold text-sm sm:text-base ${t.text} tracking-wider`}>
                  {t.name}
                </div>
                <div className="text-xs sm:text-sm text-slate-400 mt-0.5">{t.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────
// Section 5 — Comparison Table
// ────────────────────────────────────────────────────────────────
function CompareTable() {
  const rows = [
    { label: 'Full S&P 500 screening', vals: ['yes', 'no', 'partial', 'yes'] },
    { label: 'Custom 100-point scoring', vals: ['no', 'no', 'Quant ratings', 'yes'] },
    { label: '8 super investor tracking', vals: ['Manual', 'no', 'no', 'Automated'] },
    { label: 'Congressional trade monitoring', vals: ['no', 'yes', 'no', 'Committee-weighted'] },
    { label: 'AI-written investment theses', vals: ['no', 'no', 'no', 'Per stock'] },
    { label: 'Multi-layer consensus signals', vals: ['no', 'no', 'no', '4-layer'] },
    { label: 'Self-improving algorithm', vals: ['no', 'no', 'no', 'Learns from outcomes'] },
    { label: 'Entry zones + position sizing', vals: ['Charts only', 'no', 'no', '5-tranche system'] },
  ];

  const cols = ['Bloomberg', 'Unusual Whales', 'Seeking Alpha', 'SimuAlpha'];

  const renderCell = (val, isUs, isCost = false) => {
    if (val === 'yes') {
      return <Check size={18} className={isUs ? 'inline text-emerald-400' : 'inline text-slate-400'} />;
    }
    if (val === 'no') {
      return <X size={18} className="inline text-slate-600" />;
    }
    return (
      <span className={`text-xs sm:text-sm ${isUs ? 'text-emerald-300 font-medium' : 'text-slate-400'}`}>
        {val}
      </span>
    );
  };

  return (
    <section id="compare" className="py-20 sm:py-28 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div {...fadeUp} className="text-center mb-12">
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">
            Compare The Stack
          </h2>
          <p className="mt-4 text-slate-400 max-w-xl mx-auto">
            Side-by-side with the platforms hedge funds and retail investors actually use.
          </p>
        </motion.div>

        <motion.div {...fadeUp} className="overflow-x-auto -mx-4 sm:mx-0">
          <div className="min-w-[720px] mx-4 sm:mx-0 rounded-2xl border border-slate-800 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-900/80 border-b border-slate-800">
                  <th className="px-4 sm:px-6 py-4 text-xs sm:text-sm font-semibold text-slate-400 uppercase tracking-wider">
                    Capability
                  </th>
                  {cols.map((c, i) => (
                    <th
                      key={c}
                      className={`px-3 sm:px-5 py-4 text-center text-xs sm:text-sm font-semibold uppercase tracking-wider ${
                        i === 3
                          ? 'text-blue-300 bg-gradient-to-b from-blue-500/15 to-indigo-500/10 border-x border-blue-500/40'
                          : 'text-slate-500'
                      }`}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={row.label} className={ri % 2 === 0 ? 'bg-slate-950/40' : 'bg-slate-900/20'}>
                    <td className="px-4 sm:px-6 py-3 text-sm sm:text-base text-slate-200 font-medium">
                      {row.label}
                    </td>
                    {row.vals.map((v, vi) => (
                      <td
                        key={vi}
                        className={`px-3 sm:px-5 py-3 text-center ${
                          vi === 3
                            ? 'bg-blue-500/5 border-x border-blue-500/30'
                            : ''
                        }`}
                      >
                        {renderCell(v, vi === 3)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="bg-slate-900/80 border-t-2 border-slate-700">
                  <td className="px-4 sm:px-6 py-5 text-sm sm:text-base font-bold text-white uppercase tracking-wider">
                    Monthly Cost
                  </td>
                  <td className="px-3 sm:px-5 py-5 text-center text-base sm:text-lg font-bold text-slate-300">$2,000+</td>
                  <td className="px-3 sm:px-5 py-5 text-center text-base sm:text-lg font-bold text-slate-300">$50</td>
                  <td className="px-3 sm:px-5 py-5 text-center text-base sm:text-lg font-bold text-slate-300">$25</td>
                  <td className="px-3 sm:px-5 py-5 text-center bg-gradient-to-b from-blue-500/15 to-indigo-500/10 border-x border-b border-blue-500/40">
                    <div className="text-xl sm:text-2xl font-bold text-blue-300">$29</div>
                    <div className="text-[10px] sm:text-xs text-blue-400/80 mt-1 font-medium">10x the intelligence</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </motion.div>

        <motion.div {...fadeUp} className="mt-10 text-center">
          <CTAButton>
            Get SimuAlpha for $29 <ArrowRight size={16} />
          </CTAButton>
        </motion.div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────
// Section 6 — How It Works
// ────────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    {
      icon: <Layers size={22} />,
      title: 'We Scan Everything',
      body: 'S&P 500 scored daily. 30+ intelligence sources. 8 super investors tracked.',
    },
    {
      icon: <Brain size={22} />,
      title: 'AI Does The Analysis',
      body: 'Full research note per opportunity. Fundamentals, technicals, institutional positioning, risk.',
    },
    {
      icon: <Target size={22} />,
      title: 'You Get Clear Signals',
      body: 'Specific stocks, specific entry zones, specific conviction levels. Position sizing and profit targets included.',
    },
  ];

  return (
    <section className="py-20 sm:py-28 px-4 sm:px-6 bg-gradient-to-b from-transparent via-slate-900/40 to-transparent">
      <div className="max-w-6xl mx-auto">
        <motion.div {...fadeUp} className="text-center mb-14">
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">
            How It Works
          </h2>
          <p className="mt-4 text-slate-400 max-w-xl mx-auto">
            Three steps from market noise to your morning game plan.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="relative rounded-2xl border border-slate-800 bg-slate-900/40 p-6 sm:p-8"
            >
              <div className="absolute -top-3 -left-3 w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-blue-500/40">
                {i + 1}
              </div>
              <div className="inline-flex w-12 h-12 rounded-xl bg-slate-800/80 text-blue-400 items-center justify-center mb-5 ring-1 ring-inset ring-white/5">
                {s.icon}
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">{s.title}</h3>
              <p className="text-sm sm:text-base text-slate-400 leading-relaxed">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────
// Section 7 — Pricing
// ────────────────────────────────────────────────────────────────
function Pricing() {
  const plans = [
    {
      name: 'Free',
      price: '$0',
      tagline: 'Get a feel for the platform',
      features: ['Top 10 stocks visible', 'Limited screener', 'Daily market summary'],
      cta: 'Start Free',
      highlight: false,
    },
    {
      name: 'Pro',
      price: '$29',
      tagline: 'For serious investors',
      features: [
        'Full screener + theses',
        'SAIN intelligence network',
        'Portfolio tracker',
        'Custom alerts',
        'All signal tiers',
      ],
      cta: 'Get Pro Access',
      highlight: true,
    },
    {
      name: 'Institutional',
      price: '$79',
      tagline: 'Power users + teams',
      features: [
        'Everything in Pro',
        'AI chat assistant',
        'API access',
        'Priority analysis',
        'Backtesting dashboard',
      ],
      cta: 'Get Institutional',
      highlight: false,
    },
  ];

  return (
    <section id="pricing" className="py-20 sm:py-28 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div {...fadeUp} className="relative rounded-3xl p-[1.5px] bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600">
          <div className="rounded-3xl bg-[#0a0e1a] px-5 sm:px-10 py-12 sm:py-16">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">
                Stop Paying for Data.<br />
                <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                  Start Getting Answers.
                </span>
              </h2>
              <p className="mt-5 text-slate-400 max-w-2xl mx-auto text-sm sm:text-base">
                Bloomberg charges $24,000/year. Hedge funds charge 2% + 20%. SimuAlpha gives you
                the same caliber of intelligence for less than a dinner out.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
              {plans.map((p) => (
                <div
                  key={p.name}
                  className={`relative rounded-2xl p-6 sm:p-7 flex flex-col ${
                    p.highlight
                      ? 'bg-gradient-to-b from-blue-600/30 to-indigo-700/20 border-2 border-blue-400/60 shadow-xl shadow-blue-500/20 scale-[1.02]'
                      : 'bg-slate-900/60 border border-slate-800'
                  }`}
                >
                  {p.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-blue-400 to-indigo-500 text-white text-xs font-bold tracking-wider shadow-lg">
                      MOST POPULAR
                    </div>
                  )}
                  <div className="text-sm font-medium text-slate-400 mb-1">{p.name}</div>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-4xl sm:text-5xl font-bold text-white">{p.price}</span>
                    {p.price !== '$0' && <span className="text-slate-400 text-sm">/mo</span>}
                  </div>
                  <div className="text-xs text-slate-500 mb-6">{p.tagline}</div>
                  <ul className="space-y-3 mb-7 flex-1">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm text-slate-300">
                        <Check size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <CTAButton variant={p.highlight ? 'primary' : 'outline'} className="w-full">
                    {p.cta}
                  </CTAButton>
                </div>
              ))}
            </div>

            <div className="mt-10 text-center">
              <CTAButton className="!px-10 !py-4 text-base">
                Get Access on Patreon <ArrowRight size={18} />
              </CTAButton>
              <p className="mt-4 text-xs text-slate-500">
                Cancel anytime. No contracts.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────
// Section 8 — FAQ
// ────────────────────────────────────────────────────────────────
function FAQ() {
  const items = [
    {
      q: 'How is this different from Seeking Alpha or Motley Fool?',
      a: 'They give you opinions. We give you a system. Every stock gets a quantitative score — not one analyst\u2019s gut feeling. And our system gets smarter by tracking its own accuracy.',
    },
    {
      q: 'Do I need to know technical analysis?',
      a: 'No. SimuAlpha does the analysis and tells you in plain English what it found, why it matters, and what to do about it.',
    },
    {
      q: 'How do you track politician trades?',
      a: 'Congress members must disclose trades within 45 days. We monitor filings in real-time and weight them by committee jurisdiction — a Health Committee senator buying pharma is a stronger signal.',
    },
    {
      q: 'What makes your scoring better than a stock screener?',
      a: 'Screeners filter by static metrics. SimuAlpha combines fundamental quality, technical positioning, institutional consensus, politician activity, AI model signals, and multi-signal confluence into one number.',
    },
    {
      q: 'Can I cancel anytime?',
      a: 'Yes. Cancel on Patreon anytime with no penalty.',
    },
  ];

  const [open, setOpen] = useState(0);

  return (
    <section className="py-20 sm:py-28 px-4 sm:px-6 bg-gradient-to-b from-transparent via-slate-900/40 to-transparent">
      <div className="max-w-3xl mx-auto">
        <motion.div {...fadeUp} className="text-center mb-12">
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">
            Frequently Asked
          </h2>
        </motion.div>

        <div className="space-y-3">
          {items.map((item, i) => {
            const isOpen = open === i;
            return (
              <motion.div
                key={item.q}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden"
              >
                <button
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 sm:px-6 py-5 text-left hover:bg-slate-900/60 transition-colors"
                >
                  <span className="text-sm sm:text-base font-medium text-white">{item.q}</span>
                  {isOpen
                    ? <ChevronUp size={18} className="text-slate-400 flex-shrink-0" />
                    : <ChevronDown size={18} className="text-slate-400 flex-shrink-0" />}
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 sm:px-6 pb-5 text-sm sm:text-base text-slate-400 leading-relaxed">
                        {item.a}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        <motion.div {...fadeUp} className="mt-12 text-center">
          <CTAButton>
            Join on Patreon <ArrowRight size={16} />
          </CTAButton>
        </motion.div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────
// Section 9 — Transparency
// ────────────────────────────────────────────────────────────────
function Transparency() {
  return (
    <section className="py-20 sm:py-24 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <motion.div
          {...fadeUp}
          className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/80 to-slate-900/40 px-6 sm:px-10 py-10 sm:py-12 text-center"
        >
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-400 mb-5 ring-1 ring-inset ring-emerald-500/20">
            <Trophy size={26} />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Results Speak Louder Than Promises.
          </h2>
          <p className="text-slate-400 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
            We publish our signal accuracy dashboard — every signal, every outcome, no
            cherry-picking. Current tracked accuracy: <span className="text-emerald-300 font-semibold">backtested 72% win rate</span> on
            highest-conviction signals.
          </p>
          <div className="mt-7">
            <CTAButton>
              See The Receipts <ArrowRight size={16} />
            </CTAButton>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────
// Section 10 — Footer
// ────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="border-t border-slate-800/70 px-4 sm:px-6 py-10 mt-8">
      <div className="max-w-5xl mx-auto text-center text-xs sm:text-sm text-slate-500 leading-relaxed">
        <div className="mb-2">
          Built by <span className="text-slate-300 font-medium">Hephzibah Technologies LLC</span> | Powered by <span className="text-slate-300 font-medium">Claude AI</span>
        </div>
        <div>
          This is not financial advice. Past performance does not guarantee future results.
        </div>
      </div>
    </footer>
  );
}

// ────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────
export default function LandingPage() {
  // Inject SimuAlpha title for the standalone landing
  useEffect(() => {
    const prev = document.title;
    document.title = 'SimuAlpha — Stock Discovery Built On Institutional Intelligence';
    return () => { document.title = prev; };
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-slate-100 antialiased">
      <TopNav />
      <Hero />
      <SocialProofBar />
      <Features />
      <SignalHierarchy />
      <CompareTable />
      <HowItWorks />
      <Pricing />
      <FAQ />
      <Transparency />
      <Footer />
    </div>
  );
}
