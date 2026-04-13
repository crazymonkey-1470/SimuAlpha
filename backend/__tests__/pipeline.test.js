const { fundamentalGate } = require('../pipeline/fundamental_gate');
const { lynchScreen, computePEG } = require('../pipeline/lynch_screen');
const { buffettScreen } = require('../pipeline/buffett_screen');
const { healthCheck } = require('../pipeline/health_check');

// ═══════════════════════════════════════════
// FUNDAMENTAL GATE
// ═══════════════════════════════════════════

describe('fundamentalGate', () => {
  it('passes a healthy stock', () => {
    const result = fundamentalGate({
      revenueGrowth3YrAvg: 15,
      revenueGrowthYoY: 20,
      grossMarginCurrent: 60,
      grossMarginPriorYear: 58,
      ttmEBITDA: 5e9,
      totalDebt: 10e9,
      epsGrowthQoQ: 5,
      epsGrowthPriorQoQ: 8,
    });
    expect(result.passes).toBe(true);
    expect(result.disqualified).toBe(false);
    expect(result.failures).toHaveLength(0);
  });

  it('disqualifies for declining revenue', () => {
    const result = fundamentalGate({
      revenueGrowth3YrAvg: -5,
      revenueGrowthYoY: -3,
    });
    expect(result.disqualified).toBe(true);
    expect(result.failures).toContain('REVENUE_DECLINING');
  });

  it('passes if 3yr avg negative but YoY positive', () => {
    const result = fundamentalGate({
      revenueGrowth3YrAvg: -2,
      revenueGrowthYoY: 5,
    });
    expect(result.failures).not.toContain('REVENUE_DECLINING');
  });

  it('disqualifies for contracting gross margin', () => {
    const result = fundamentalGate({
      grossMarginCurrent: 45,
      grossMarginPriorYear: 55,
    });
    expect(result.disqualified).toBe(true);
    expect(result.failures).toContain('GROSS_MARGIN_CONTRACTING');
  });

  it('disqualifies for weak debt service', () => {
    const result = fundamentalGate({
      ttmEBITDA: 100e6,
      totalDebt: 5e9, // annual service = 500M, EBITDA/service = 0.2
    });
    expect(result.disqualified).toBe(true);
    expect(result.failures).toContain('DEBT_SERVICE_WEAK');
  });

  it('disqualifies for deteriorating guidance (2 consecutive EPS declines)', () => {
    const result = fundamentalGate({
      epsGrowthQoQ: -15,
      epsGrowthPriorQoQ: -12,
    });
    expect(result.failures).toContain('GUIDANCE_DETERIORATING');
  });

  it('disqualifies for insider selling + dilution', () => {
    const result = fundamentalGate({
      sharesOutstandingChange: 0.05,
      insiderNetBuying: false,
    });
    expect(result.failures).toContain('INSIDER_SELLING_HEAVY');
  });

  it('handles empty stock object gracefully', () => {
    const result = fundamentalGate({});
    expect(result.passes).toBe(true); // no data = no failures (null checks)
  });

  it('can accumulate multiple failures', () => {
    const result = fundamentalGate({
      revenueGrowth3YrAvg: -5,
      revenueGrowthYoY: -3,
      grossMarginCurrent: 30,
      grossMarginPriorYear: 50,
      ttmEBITDA: 50e6,
      totalDebt: 5e9,
    });
    expect(result.failures.length).toBeGreaterThanOrEqual(3);
  });
});

// ═══════════════════════════════════════════
// LYNCH SCREEN
// ═══════════════════════════════════════════

describe('lynchScreen', () => {
  it('passes a perfect Lynch stock (7/7)', () => {
    const result = lynchScreen({
      peRatio: 12,
      forwardPE: 10,
      debtToEquity: 0.2,
      epsGrowthYoY: 20,
      marketCap: 10e9,
      insiderNetBuying: true,
    });
    expect(result.score).toBe(7);
    expect(result.passesScreen).toBe(true);
    expect(result.badge).toBe('LYNCH_PERFECT_SCORE');
  });

  it('fails a stock below threshold', () => {
    const result = lynchScreen({
      peRatio: 50,
      forwardPE: 40,
      debtToEquity: 1.0,
      epsGrowthYoY: 5,
      marketCap: 1e9,
      insiderNetBuying: false,
    });
    expect(result.score).toBeLessThan(5);
    expect(result.passesScreen).toBe(false);
  });

  it('returns max score of 7', () => {
    expect(lynchScreen({}).maxScore).toBe(7);
  });

  it('tracks passes and fails separately', () => {
    const result = lynchScreen({ peRatio: 12, forwardPE: 10 });
    expect(result.passes.length + result.fails.length).toBe(7);
  });
});

describe('computePEG', () => {
  it('computes P/E divided by EPS growth', () => {
    expect(computePEG({ peRatio: 20, epsGrowthYoY: 20 })).toBe(1);
  });

  it('returns null for zero or negative PE', () => {
    expect(computePEG({ peRatio: 0, epsGrowthYoY: 10 })).toBeNull();
    expect(computePEG({ peRatio: -5, epsGrowthYoY: 10 })).toBeNull();
  });

  it('returns null for zero or negative EPS growth', () => {
    expect(computePEG({ peRatio: 20, epsGrowthYoY: 0 })).toBeNull();
    expect(computePEG({ peRatio: 20, epsGrowthYoY: -5 })).toBeNull();
  });

  it('returns null for missing data', () => {
    expect(computePEG({})).toBeNull();
  });
});

// ═══════════════════════════════════════════
// BUFFETT SCREEN
// ═══════════════════════════════════════════

describe('buffettScreen', () => {
  it('passes a classic Buffett stock (high score)', () => {
    const result = buffettScreen({
      peRatio: 12,
      forwardPE: 11,
      freeCashFlow: 5e9,
      marketCap: 40e9, // Price/FCF = 8
      operatingMargin: 25,
      returnOnInvestment: 15,
      netIncome: 3e9,
      dividendYield: 2,
      epsGrowth5Yr: 25,
      insiderOwnership: 8,
    });
    expect(result.score).toBe(9);
    expect(result.passesScreen).toBe(true);
  });

  it('fails a growth-at-any-price stock', () => {
    const result = buffettScreen({
      peRatio: 80,
      forwardPE: 60,
      freeCashFlow: -1e9,
      marketCap: 200e9,
      operatingMargin: 5,
      returnOnInvestment: 3,
      netIncome: -500e6,
      dividendYield: 0,
      epsGrowth5Yr: 5,
    });
    expect(result.score).toBeLessThan(6);
    expect(result.passesScreen).toBe(false);
  });

  it('returns max score of 9', () => {
    expect(buffettScreen({}).maxScore).toBe(9);
  });

  it('passes management test via buybacks', () => {
    const result = buffettScreen({ sharesOutstandingChange: -0.03 });
    expect(result.passes).toContain('MANAGEMENT');
  });
});

// ═══════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════

describe('healthCheck', () => {
  it('returns max score (12) for a healthy stock', () => {
    const result = healthCheck({
      sector: 'Information Technology',
      peRatio: 20,
      debtToEquity: 0.3,
      fcfMargin: 25,
      currentRatio: 2.0,
      revenueGrowthYoY: 15,
      epsGrowthYoY: 18,
      returnOnEquity: 20,
      freeCashFlow: 5e9,
      fcfPerShare: 8,
      epsDiluted: 5,
      insiderNetBuying: true,
    });
    expect(result.healthScore).toBe(12);
    expect(result.redFlagCount).toBe(0);
  });

  it('flags elevated P/E', () => {
    const result = healthCheck({
      sector: 'Information Technology',
      peRatio: 100, // > 28 * 1.5 = 42
    });
    expect(result.redFlags).toContain('PE_ELEVATED');
  });

  it('flags negative P/E', () => {
    const result = healthCheck({
      sector: 'Consumer Staples',
      peRatio: -5,
    });
    expect(result.redFlags).toContain('PE_ELEVATED');
  });

  it('flags FCF negative with heavy penalty', () => {
    const result = healthCheck({
      sector: 'Energy',
      freeCashFlow: -1e9,
    });
    expect(result.redFlags).toContain('FCF_NEGATIVE');
    // FCF negative = -3 points
    expect(result.healthScore).toBeLessThanOrEqual(9);
  });

  it('flags liquidity risk for current ratio < 1.0', () => {
    const result = healthCheck({
      sector: 'Industrials',
      currentRatio: 0.7,
    });
    expect(result.redFlags).toContain('LIQUIDITY_RISK');
  });

  it('flags capital inefficiency for current ratio > 4.0', () => {
    const result = healthCheck({
      sector: 'Materials',
      currentRatio: 5.0,
    });
    expect(result.redFlags).toContain('CAPITAL_INEFFICIENT');
  });

  it('flags EPS growth without revenue (manipulation suspect)', () => {
    const result = healthCheck({
      sector: 'Financials',
      epsGrowthYoY: 20,
      revenueGrowthYoY: -5,
    });
    expect(result.redFlags).toContain('EPS_WITHOUT_REVENUE');
    expect(result.redFlags).toContain('MANIPULATION_SUSPECTED');
  });

  it('uses Industrials defaults for unknown sector', () => {
    const result = healthCheck({ sector: 'Alien Technology' });
    expect(result.sectorMedians).toEqual(
      expect.objectContaining({ pe: 18 }),
    );
  });

  it('never returns negative health score', () => {
    const result = healthCheck({
      sector: 'Information Technology',
      peRatio: -10,
      debtToEquity: 5.0,
      currentRatio: 0.3,
      revenueGrowthErratic: true,
      epsGrowthYoY: 20,
      revenueGrowthYoY: -10,
      returnOnEquity: 2,
      dividendPayoutRatio: 95,
      freeCashFlow: -2e9,
      fcfPerShare: 0.5,
      epsDiluted: 5,
      inventoryGrowth: 50,
      insiderNetBuying: false,
    });
    expect(result.healthScore).toBeGreaterThanOrEqual(0);
  });
});
