import React, { useState } from 'react';
import { Check, X, Zap, Brain, TrendingUp, Users, Shield } from 'lucide-react';

export default function LandingPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!email) return;

    try {
      const res = await fetch('/api/waitlist/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'landing' }),
      });

      if (res.ok) {
        setSubmitted(true);
        setEmail('');
        setTimeout(() => setSubmitted(false), 3000);
      }
    } catch (err) {
      console.error('Signup failed', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      
      {/* HEADER */}
      <header className="fixed top-0 w-full bg-slate-900/80 backdrop-blur border-b border-slate-700 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-2xl font-bold">SimuAlpha</div>
          <a href="mailto:hello@simualpha.com" className="text-slate-300 hover:text-white">Contact</a>
        </div>
      </header>

      {/* HERO */}
      <section className="pt-32 px-6 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-6xl sm:text-7xl font-bold tracking-tight mb-6">
            Smart Elliott Wave Analysis
          </h1>
          <p className="text-xl text-slate-300 mb-8">
            Institutional-grade signal analysis powered by AI that learns and improves every week
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto mb-12">
            <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-6">
              <h3 className="text-2xl font-bold mb-2">Free</h3>
              <p className="text-slate-400 mb-4">Get started with basic analysis</p>
              <button className="w-full bg-slate-600 hover:bg-slate-700 text-white font-bold py-2 rounded-lg transition">
                Sign Up Free
              </button>
            </div>
            
            <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-lg p-6">
              <h3 className="text-2xl font-bold mb-2">$10/month</h3>
              <p className="text-slate-400 mb-4">Pro features and real-time signals</p>
              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg transition">
                Start Premium
              </button>
            </div>
          </div>

          {/* SIGNUP FORM */}
          <form onSubmit={handleSignup} className="max-w-md mx-auto mb-12 space-y-3">
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500"
              required
            />
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition"
            >
              Get Early Access
            </button>
          </form>

          {submitted && (
            <p className="text-green-400 mb-8">✓ Welcome! Check your email.</p>
          )}

          <p className="text-sm text-slate-400">
            No credit card required. Cancel anytime.
          </p>
        </div>
      </section>

      {/* WHAT IS SIMUALPHA */}
      <section className="px-6 py-20 bg-slate-800/50 border-t border-slate-700">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-4xl font-bold mb-12">What is SimuAlpha?</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <p className="text-slate-300 mb-4">
                SimuAlpha is a trading analysis platform that combines Elliott Wave theory with institutional intelligence to identify high-probability market opportunities.
              </p>
              <p className="text-slate-300 mb-4">
                Rather than static indicators, SimuAlpha uses agentic AI systems that learn from every trade outcome, constantly improving their accuracy and adapting to market conditions.
              </p>
            </div>
            <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-6">
              <h3 className="font-bold mb-4">Built on Three Pillars</h3>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <TrendingUp className="text-blue-400 flex-shrink-0" size={20} />
                  <div>
                    <div className="font-semibold">Elliott Wave Analysis</div>
                    <div className="text-sm text-slate-400">Pattern recognition based on market psychology</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Users className="text-green-400 flex-shrink-0" size={20} />
                  <div>
                    <div className="font-semibold">Institutional Intelligence</div>
                    <div className="text-sm text-slate-400">Track what the smart money is doing</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Brain className="text-purple-400 flex-shrink-0" size={20} />
                  <div>
                    <div className="font-semibold">Agentic Learning</div>
                    <div className="text-sm text-slate-400">AI that improves itself every week</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-4xl font-bold mb-12">What You Get</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-6">
              <div className="flex items-start gap-3 mb-3">
                <Check className="text-green-400 flex-shrink-0 mt-1" size={20} />
                <h3 className="font-bold text-lg">Entry Analysis</h3>
              </div>
              <p className="text-slate-400 text-sm">
                Identify high-probability entry zones where institutions are accumulating
              </p>
            </div>

            <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-6">
              <div className="flex items-start gap-3 mb-3">
                <Check className="text-green-400 flex-shrink-0 mt-1" size={20} />
                <h3 className="font-bold text-lg">Portfolio Tracking</h3>
              </div>
              <p className="text-slate-400 text-sm">
                Monitor your positions and track performance against the market
              </p>
            </div>

            <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-6">
              <div className="flex items-start gap-3 mb-3">
                <Check className="text-green-400 flex-shrink-0 mt-1" size={20} />
                <h3 className="font-bold text-lg">Weekly Learning Reports</h3>
              </div>
              <p className="text-slate-400 text-sm">
                See how our agentic systems learned from market data and improved accuracy
              </p>
            </div>

            <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-6">
              <div className="flex items-start gap-3 mb-3">
                <Check className="text-green-400 flex-shrink-0 mt-1" size={20} />
                <h3 className="font-bold text-lg">Institutional Tracking</h3>
              </div>
              <p className="text-slate-400 text-sm">
                See what Berkshire, Citadel, and other funds are buying
              </p>
            </div>

            <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-6">
              <div className="flex items-start gap-3 mb-3">
                <Check className="text-green-400 flex-shrink-0 mt-1" size={20} />
                <h3 className="font-bold text-lg">Email Alerts</h3>
              </div>
              <p className="text-slate-400 text-sm">
                Get notified when major opportunities are identified
              </p>
            </div>

            <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-6">
              <div className="flex items-start gap-3 mb-3">
                <Check className="text-green-400 flex-shrink-0 mt-1" size={20} />
                <h3 className="font-bold text-lg">Self-Improving System</h3>
              </div>
              <p className="text-slate-400 text-sm">
                Our AI learns from outcomes and gets better every week
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* COMPARISON TABLE */}
      <section className="px-6 py-20 bg-slate-800/50 border-t border-slate-700">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-4xl font-bold mb-12">How SimuAlpha Compares</h2>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 font-semibold">Feature</th>
                  <th className="text-center py-3 px-4 font-semibold">SimuAlpha</th>
                  <th className="text-center py-3 px-4 font-semibold">TradingView</th>
                  <th className="text-center py-3 px-4 font-semibold">Bloomberg</th>
                  <th className="text-center py-3 px-4 font-semibold">Finviz</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                <tr>
                  <td className="py-3 px-4">Price</td>
                  <td className="py-3 px-4 text-center font-bold text-green-400">$10/mo</td>
                  <td className="py-3 px-4 text-center">$15/mo</td>
                  <td className="py-3 px-4 text-center">$24,000/yr</td>
                  <td className="py-3 px-4 text-center">$40/mo</td>
                </tr>
                <tr className="bg-slate-700/20">
                  <td className="py-3 px-4">Elliott Wave Analysis</td>
                  <td className="py-3 px-4 text-center"><Check className="inline text-green-400" size={20} /></td>
                  <td className="py-3 px-4 text-center"><X className="inline text-slate-500" size={20} /></td>
                  <td className="py-3 px-4 text-center"><Check className="inline text-green-400" size={20} /></td>
                  <td className="py-3 px-4 text-center"><X className="inline text-slate-500" size={20} /></td>
                </tr>
                <tr>
                  <td className="py-3 px-4">AI Learning System</td>
                  <td className="py-3 px-4 text-center"><Check className="inline text-green-400" size={20} /></td>
                  <td className="py-3 px-4 text-center"><X className="inline text-slate-500" size={20} /></td>
                  <td className="py-3 px-4 text-center"><X className="inline text-slate-500" size={20} /></td>
                  <td className="py-3 px-4 text-center"><X className="inline text-slate-500" size={20} /></td>
                </tr>
                <tr className="bg-slate-700/20">
                  <td className="py-3 px-4">Institutional Tracking</td>
                  <td className="py-3 px-4 text-center"><Check className="inline text-green-400" size={20} /></td>
                  <td className="py-3 px-4 text-center"><Check className="inline text-green-400" size={20} /></td>
                  <td className="py-3 px-4 text-center"><Check className="inline text-green-400" size={20} /></td>
                  <td className="py-3 px-4 text-center"><Check className="inline text-green-400" size={20} /></td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Portfolio Tracking</td>
                  <td className="py-3 px-4 text-center"><Check className="inline text-green-400" size={20} /></td>
                  <td className="py-3 px-4 text-center"><Check className="inline text-green-400" size={20} /></td>
                  <td className="py-3 px-4 text-center"><Check className="inline text-green-400" size={20} /></td>
                  <td className="py-3 px-4 text-center"><Check className="inline text-green-400" size={20} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* AGENTIC AI */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-4xl font-bold mb-12">Agentic AI That Learns</h2>
          <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-lg p-8">
            <div className="mb-6">
              <h3 className="text-2xl font-bold mb-4 flex items-center gap-3">
                <Brain className="text-purple-400" size={32} />
                How We Get Better Every Week
              </h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center font-bold">1</div>
                <div>
                  <h4 className="font-semibold mb-1">Signals Fire</h4>
                  <p className="text-slate-400">Our system identifies opportunities and sends analysis</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center font-bold">2</div>
                <div>
                  <h4 className="font-semibold mb-1">Outcomes Track</h4>
                  <p className="text-slate-400">We measure what actually happened vs our prediction</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center font-bold">3</div>
                <div>
                  <h4 className="font-semibold mb-1">AI Learns</h4>
                  <p className="text-slate-400">Agentic system analyzes: what worked? what didn't? why?</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center font-bold">4</div>
                <div>
                  <h4 className="font-semibold mb-1">Self-Improves</h4>
                  <p className="text-slate-400">System adjusts weights automatically, gets smarter next week</p>
                </div>
              </div>
            </div>

            <div className="mt-8 p-4 bg-slate-800/50 rounded border border-slate-700">
              <p className="text-slate-300">
                <strong>Unlike static indicators:</strong> SimuAlpha doesn't stay the same. Every week, the AI reviews signal outcomes and proposes improvements. You get a smarter system automatically.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="px-6 py-20 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-t border-slate-700">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-4xl font-bold mb-6">Ready to Trade Smarter?</h2>
          <p className="text-xl text-slate-300 mb-8">
            Join traders who use institutional-grade analysis for just $10/month.
          </p>
          
          <form onSubmit={handleSignup} className="space-y-3 max-w-md mx-auto">
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500"
              required
            />
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition"
            >
              Get Early Access
            </button>
          </form>

          {submitted && (
            <p className="text-green-400 text-sm mt-3">✓ You're on the list!</p>
          )}
          
          <p className="text-sm text-slate-400 mt-6">
            No credit card required. Cancel anytime.
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="px-6 py-12 border-t border-slate-700 text-center text-slate-400">
        <p>SimuAlpha © 2026. Institutional analysis for everyone.</p>
        <p className="text-sm mt-4">
          <a href="#" className="hover:text-slate-200">Privacy</a> • 
          <a href="#" className="hover:text-slate-200 ml-2">Terms</a> • 
          <a href="#" className="hover:text-slate-200 ml-2">Contact</a>
        </p>
      </footer>
    </div>
  );
}
