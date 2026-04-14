/**
 * Polymarket Integration — SimuAlpha Macro Context Layer
 *
 * Pulls macro-relevant prediction market odds from Polymarket's public Gamma API.
 * No API key required — fully public.
 *
 * Used to supplement macro_context with real-time market consensus on:
 * - Fed rate decisions
 * - Recession probability
 * - Geopolitical events
 * - Regulatory actions affecting markets
 */

const log = require('./logger').child({ module: 'polymarket' });

const GAMMA_API = 'https://gamma-api.polymarket.com';

const MACRO_KEYWORDS = [
  'fed', 'federal reserve', 'rate cut', 'rate hike', 'interest rate',
  'recession', 'inflation', 'cpi', 'gdp', 'unemployment',
  'tariff', 'trade war', 'china',
  'market crash', 'bear market', 's&p 500',
  'iran', 'war', 'geopolitical',
  'sec', 'regulation', 'crypto ban',
  'kevin warsh', 'powell', 'treasury',
];

/**
 * Fetch macro-relevant Polymarket markets
 * Returns top markets with odds for SimuAlpha macro context
 */
async function getMacroMarkets(limit = 20) {
  try {
    const res = await fetch(
      `${GAMMA_API}/markets?limit=100&active=true&order=volume&ascending=false`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`Polymarket API: ${res.status}`);
    const markets = await res.json();

    // Filter to macro-relevant markets
    const macroMarkets = markets.filter(m => {
      const q = (m.question || '').toLowerCase();
      return MACRO_KEYWORDS.some(k => q.includes(k));
    });

    return macroMarkets.slice(0, limit).map(m => {
      const outcomes = JSON.parse(m.outcomes || '[]');
      const prices = JSON.parse(m.outcomePrices || '[]');
      return {
        question: m.question,
        slug: m.slug,
        outcomes: outcomes.map((o, i) => ({
          name: o,
          probability: Math.round((parseFloat(prices[i] || 0)) * 100),
        })),
        volume_24h: Math.round(m.volume24hr || 0),
        end_date: m.endDate,
      };
    });
  } catch (err) {
    log.warn({ err: err.message }, 'Polymarket fetch failed');
    return [];
  }
}

/**
 * Get specific macro signals for SimuAlpha scoring
 * Returns structured signals: recession_prob, rate_cut_prob, geopolitical_risk
 */
async function getMacroSignals() {
  const markets = await getMacroMarkets(50);

  const signals = {
    recession_probability: null,
    rate_cut_probability: null,
    fed_chair_uncertainty: null,
    geopolitical_risk_active: null,
    top_markets: [],
  };

  for (const m of markets) {
    const q = m.question.toLowerCase();
    const yesOutcome = m.outcomes.find(o => o.name.toLowerCase() === 'yes');
    const yesPct = yesOutcome?.probability;

    // Recession probability
    if (q.includes('recession') && yesPct != null) {
      signals.recession_probability = Math.max(signals.recession_probability || 0, yesPct);
    }

    // Rate cut probability
    if ((q.includes('rate cut') || q.includes('rate cuts')) && yesPct != null) {
      signals.rate_cut_probability = Math.max(signals.rate_cut_probability || 0, yesPct);
    }

    // Fed chair uncertainty (Warsh confirmation etc.)
    if ((q.includes('fed') || q.includes('warsh') || q.includes('powell')) && yesPct != null) {
      signals.fed_chair_uncertainty = yesPct < 70; // uncertainty if not high confidence
    }

    // Geopolitical risk
    if ((q.includes('iran') || q.includes('war') || q.includes('military')) && yesPct != null) {
      if (yesPct > 30) signals.geopolitical_risk_active = true;
    }

    signals.top_markets.push(m);
  }

  signals.top_markets = signals.top_markets.slice(0, 5);
  return signals;
}

module.exports = { getMacroMarkets, getMacroSignals };
