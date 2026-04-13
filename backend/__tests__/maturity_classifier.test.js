const { classifyMaturity, TICKER_OVERRIDES, MATURITY_PROFILES } = require('../services/maturity_classifier');

describe('classifyMaturity', () => {
  // ═══════════════════════════════════════════
  // TICKER OVERRIDES
  // ═══════════════════════════════════════════

  it('uses exact override for known tickers', () => {
    const result = classifyMaturity({ ticker: 'AAPL' });
    expect(result.profile).toBe('TICKER_OVERRIDE');
    expect(result.wacc).toBe(TICKER_OVERRIDES.AAPL.wacc);
    expect(result.terminal).toBe(TICKER_OVERRIDES.AAPL.terminal);
    expect(result.fcfGrowth).toBe(TICKER_OVERRIDES.AAPL.fcfGrowth);
  });

  it('returns override for NVDA', () => {
    const result = classifyMaturity({ ticker: 'NVDA' });
    expect(result.wacc).toBe(8);
    expect(result.terminal).toBe(3.0);
    expect(result.fcfGrowth).toBe(21);
  });

  it('returns override for PFE (negative FCF growth)', () => {
    const result = classifyMaturity({ ticker: 'PFE' });
    expect(result.fcfGrowth).toBe(-1.5);
  });

  // ═══════════════════════════════════════════
  // AUTO-CLASSIFICATION
  // ═══════════════════════════════════════════

  it('classifies DEFENSIVE_LOW_RISK for high-dividend, high-FCF, low-beta stocks', () => {
    const result = classifyMaturity({
      ticker: 'UNKNOWN',
      dividendYield: 3,
      fcfMargin: 20,
      beta: 0.6,
      revenueGrowth3YrAvg: 5,
    });
    expect(result.profile).toBe('DEFENSIVE_LOW_RISK');
  });

  it('classifies MATURE_STABLE for slow-growth dividend payers', () => {
    const result = classifyMaturity({
      ticker: 'UNKNOWN',
      revenueGrowth3YrAvg: 5,
      fcfMargin: 15,
      dividendYield: 2,
      beta: 0.9,
    });
    expect(result.profile).toBe('MATURE_STABLE');
  });

  it('classifies HIGH_GROWTH_MONOPOLY for fast-growing high-FCF stocks', () => {
    const result = classifyMaturity({
      ticker: 'UNKNOWN',
      revenueGrowth3YrAvg: 30,
      fcfMargin: 25,
      beta: 1.2,
      dividendYield: 0,
    });
    expect(result.profile).toBe('HIGH_GROWTH_MONOPOLY');
  });

  it('classifies CYCLICAL_FX_EXPOSED for high-beta stocks', () => {
    const result = classifyMaturity({
      ticker: 'UNKNOWN',
      revenueGrowth3YrAvg: 8,
      fcfMargin: 5,
      beta: 1.5,
      dividendYield: 0.5,
    });
    expect(result.profile).toBe('CYCLICAL_FX_EXPOSED');
  });

  it('defaults to LARGE_CAP_WITH_RISK for unmatched stocks', () => {
    const result = classifyMaturity({
      ticker: 'UNKNOWN',
      revenueGrowth3YrAvg: 12,
      fcfMargin: 8,
      beta: 1.1,
      dividendYield: 0.5,
    });
    expect(result.profile).toBe('LARGE_CAP_WITH_RISK');
  });

  // ═══════════════════════════════════════════
  // OUTPUT SHAPE
  // ═══════════════════════════════════════════

  it('always returns wacc, terminal, fcfGrowth, and profile', () => {
    const result = classifyMaturity({ ticker: 'RANDOM' });
    expect(result).toHaveProperty('wacc');
    expect(result).toHaveProperty('terminal');
    expect(result).toHaveProperty('fcfGrowth');
    expect(result).toHaveProperty('profile');
    expect(typeof result.wacc).toBe('number');
    expect(typeof result.terminal).toBe('number');
    expect(typeof result.fcfGrowth).toBe('number');
  });

  it('handles completely empty stock input', () => {
    const result = classifyMaturity({ ticker: 'UNKNOWN' });
    expect(result).toBeDefined();
    expect(result.profile).toBeDefined();
  });
});
