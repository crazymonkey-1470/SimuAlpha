/**
 * Maturity Classifier — Sprint 10B
 *
 * Assigns WACC, terminal rate, and FCF growth parameters based on
 * validated TLI reports across 14 real stocks. Replaces generic
 * sector-based WACC estimation with maturity-profile classification.
 */

// Maturity profiles from TLI validated reports
const MATURITY_PROFILES = {
  DEFENSIVE_LOW_RISK: {
    wacc: [5, 6],
    terminal: [1.5, 2.0],
    fcfGrowth: [2, 5],
    description: 'AA credit, recurring revenue, capital-light',
    examples: ['NESN', 'PFE', 'V'],
  },
  MATURE_STABLE: {
    wacc: [6, 7],
    terminal: [2.0, 2.5],
    fcfGrowth: [4, 10],
    description: 'Staples, consistent cash flow',
    examples: ['KO'],
  },
  LARGE_CAP_WITH_RISK: {
    wacc: [8, 9],
    terminal: [2.5, 2.5],
    fcfGrowth: [5, 15],
    description: 'Regulatory risk, discretionary exposure',
    examples: ['UNH', 'ABNB', 'AAPL', 'LULU'],
  },
  HIGH_GROWTH_MONOPOLY: {
    wacc: [8, 9],
    terminal: [2.5, 3.0],
    fcfGrowth: [15, 28],
    description: 'Secular growth + dominant position',
    examples: ['NVDA', 'ZETA'],
  },
  CYCLICAL_FX_EXPOSED: {
    wacc: [9, 10],
    terminal: [1.5, 2.5],
    fcfGrowth: 'VARIABLE',
    description: 'Commodity/luxury, FX headwinds',
    examples: ['LVMH', 'OXY'],
  },
};

// Known ticker overrides from validated reports
const TICKER_OVERRIDES = {
  'UNH':  { wacc: 8, terminal: 2.5, fcfGrowth: 5 },
  'ZETA': { wacc: 9, terminal: 3.0, fcfGrowth: 20 },
  'NVDA': { wacc: 8, terminal: 3.0, fcfGrowth: 21 },
  'PFE':  { wacc: 6, terminal: 2.0, fcfGrowth: -1.5 },
  'LULU': { wacc: 9, terminal: 2.5, fcfGrowth: 4 },
  'ABNB': { wacc: 9, terminal: 2.5, fcfGrowth: 9.5 },
  'OXY':  { wacc: 9, terminal: 1.5, fcfGrowth: 8 },
  'KO':   { wacc: 6.5, terminal: 2.5, fcfGrowth: 5.5 },
  'V':    { wacc: 6, terminal: 2.5, fcfGrowth: 6.5 },
  'AAPL': { wacc: 9, terminal: 2.5, fcfGrowth: 11.5 },
  'NESN': { wacc: 5, terminal: 1.5, fcfGrowth: 2 },
  'LVMH': { wacc: 10, terminal: 2.5, fcfGrowth: 7.5 },
  'HOOD': { wacc: 8, terminal: 2.0, fcfGrowth: 18.5 },
};

function classifyMaturity(stock) {
  // Check for exact ticker override first
  if (TICKER_OVERRIDES[stock.ticker]) {
    return { ...TICKER_OVERRIDES[stock.ticker], profile: 'TICKER_OVERRIDE' };
  }

  // Auto-classify based on characteristics
  const revenueGrowth = stock.revenueGrowth3YrAvg || 0;
  const fcfMargin = stock.fcfMargin || 0;
  const beta = stock.beta || 1.0;
  const dividendYield = stock.dividendYield || 0;

  let profile;
  let profileName;

  if (dividendYield > 2 && fcfMargin > 15 && beta < 0.8) {
    profile = MATURITY_PROFILES.DEFENSIVE_LOW_RISK;
    profileName = 'DEFENSIVE_LOW_RISK';
  } else if (revenueGrowth < 10 && fcfMargin > 10 && dividendYield > 1) {
    profile = MATURITY_PROFILES.MATURE_STABLE;
    profileName = 'MATURE_STABLE';
  } else if (revenueGrowth > 20 && fcfMargin > 15) {
    profile = MATURITY_PROFILES.HIGH_GROWTH_MONOPOLY;
    profileName = 'HIGH_GROWTH_MONOPOLY';
  } else if (beta > 1.3 || stock.isCyclical || stock.hasFXExposure) {
    profile = MATURITY_PROFILES.CYCLICAL_FX_EXPOSED;
    profileName = 'CYCLICAL_FX_EXPOSED';
  } else {
    profile = MATURITY_PROFILES.LARGE_CAP_WITH_RISK;
    profileName = 'LARGE_CAP_WITH_RISK';
  }

  // Pick midpoint of ranges
  return {
    wacc: (profile.wacc[0] + profile.wacc[1]) / 2,
    terminal: (profile.terminal[0] + profile.terminal[1]) / 2,
    fcfGrowth: typeof profile.fcfGrowth === 'string'
      ? revenueGrowth * 0.6
      : (profile.fcfGrowth[0] + profile.fcfGrowth[1]) / 2,
    profile: profileName,
  };
}

module.exports = { classifyMaturity, TICKER_OVERRIDES, MATURITY_PROFILES };
