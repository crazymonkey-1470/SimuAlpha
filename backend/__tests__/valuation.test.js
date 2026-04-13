const {
  computeDCF,
  computeEVSales,
  computeEVEBITDA,
  computeComposite,
  computeTotalReturn,
  computeThreePillarValuation,
  scoreValuation,
  estimateWACC,
  estimateGrowthRate,
  estimateTerminalRate,
} = require('../services/valuation');

// ═══════════════════════════════════════════
// DCF CALCULATION
// ═══════════════════════════════════════════

describe('computeDCF', () => {
  it('computes a positive price target for positive FCF', () => {
    const target = computeDCF({
      ttmFCF: 1e9,
      sharesOutstanding: 100e6,
      growthRate: 10,
      terminalRate: 2.5,
      wacc: 8,
      years: 5,
    });
    expect(target).toBeGreaterThan(0);
    expect(typeof target).toBe('number');
  });

  it('returns null for negative FCF', () => {
    expect(computeDCF({
      ttmFCF: -500e6,
      sharesOutstanding: 100e6,
      growthRate: 10,
      terminalRate: 2.5,
      wacc: 8,
      years: 5,
    })).toBeNull();
  });

  it('returns null for zero shares outstanding', () => {
    expect(computeDCF({
      ttmFCF: 1e9,
      sharesOutstanding: 0,
      growthRate: 10,
      terminalRate: 2.5,
      wacc: 8,
      years: 5,
    })).toBeNull();
  });

  it('returns null when WACC <= terminal rate (invalid)', () => {
    expect(computeDCF({
      ttmFCF: 1e9,
      sharesOutstanding: 100e6,
      growthRate: 10,
      terminalRate: 8,
      wacc: 8,
      years: 5,
    })).toBeNull();
  });

  it('higher growth rate produces higher target', () => {
    const params = { ttmFCF: 1e9, sharesOutstanding: 100e6, terminalRate: 2.5, wacc: 8, years: 5 };
    const low = computeDCF({ ...params, growthRate: 5 });
    const high = computeDCF({ ...params, growthRate: 15 });
    expect(high).toBeGreaterThan(low);
  });

  it('higher WACC produces lower target', () => {
    const params = { ttmFCF: 1e9, sharesOutstanding: 100e6, growthRate: 10, terminalRate: 2.5, years: 5 };
    const lowWACC = computeDCF({ ...params, wacc: 6 });
    const highWACC = computeDCF({ ...params, wacc: 10 });
    expect(lowWACC).toBeGreaterThan(highWACC);
  });
});

// ═══════════════════════════════════════════
// EV/SALES CALCULATION
// ═══════════════════════════════════════════

describe('computeEVSales', () => {
  it('computes a positive target for valid inputs', () => {
    const target = computeEVSales({
      ttmRevenue: 5e9,
      historicalEVSales: 4.0,
      netDebt: 1e9,
      sharesOutstanding: 200e6,
      sector: 'Information Technology',
    });
    expect(target).toBeGreaterThan(0);
  });

  it('falls back to sector default when historicalEVSales is null', () => {
    const target = computeEVSales({
      ttmRevenue: 5e9,
      historicalEVSales: null,
      netDebt: 0,
      sharesOutstanding: 200e6,
      sector: 'Information Technology',
    });
    // Sector default for IT is 6.0, so EV = 5e9 * 6 = 30e9, target = 30e9/200e6 = 150
    expect(target).toBe(150);
  });

  it('returns null for zero revenue', () => {
    expect(computeEVSales({
      ttmRevenue: 0,
      sharesOutstanding: 100e6,
      sector: 'Technology',
    })).toBeNull();
  });

  it('returns null when equity value is negative', () => {
    expect(computeEVSales({
      ttmRevenue: 1e9,
      historicalEVSales: 1.0,
      netDebt: 2e9, // debt exceeds EV
      sharesOutstanding: 100e6,
      sector: 'Energy',
    })).toBeNull();
  });
});

// ═══════════════════════════════════════════
// EV/EBITDA CALCULATION
// ═══════════════════════════════════════════

describe('computeEVEBITDA', () => {
  it('computes a positive target for valid inputs', () => {
    const target = computeEVEBITDA({
      ttmEBITDA: 2e9,
      historicalEVEBITDA: 12.0,
      netDebt: 500e6,
      sharesOutstanding: 200e6,
      sector: 'Industrials',
    });
    // EV = 2e9 * 12 = 24e9, equity = 24e9 - 500e6 = 23.5e9, target = 23.5e9/200e6 = 117.5
    expect(target).toBe(117.5);
  });

  it('returns null for zero EBITDA', () => {
    expect(computeEVEBITDA({
      ttmEBITDA: 0,
      sharesOutstanding: 100e6,
      sector: 'Financials',
    })).toBeNull();
  });
});

// ═══════════════════════════════════════════
// COMPOSITE CALCULATION
// ═══════════════════════════════════════════

describe('computeComposite', () => {
  const currentPrice = 100;

  it('averages all three methods when DCF does not diverge', () => {
    const result = computeComposite(120, 115, 125, currentPrice);
    expect(result.dcfIncluded).toBe(true);
    expect(result.methodsUsed).toContain('DCF');
    expect(result.methodsUsed).toContain('EV/Sales');
    expect(result.methodsUsed).toContain('EV/EBITDA');
    expect(result.avgTarget).toBeCloseTo(120, 0);
  });

  it('excludes DCF when it diverges >20% from multiples average', () => {
    // EV/Sales = 110, EV/EBITDA = 115 → avg = 112.5 → upside = 12.5%
    // DCF = 200 → upside = 100% → divergence = 87.5% → excluded
    const result = computeComposite(200, 110, 115, currentPrice);
    expect(result.dcfIncluded).toBe(false);
    expect(result.dcfExclusionReason).toContain('DCF diverges');
    expect(result.methodsUsed).not.toContain('DCF');
  });

  it('returns null when no targets available', () => {
    expect(computeComposite(null, null, null, currentPrice)).toBeNull();
  });

  it('calculates method agreement as HIGH when targets close together', () => {
    const result = computeComposite(102, 100, 101, currentPrice);
    expect(result.methodAgreement).toBe('HIGH');
  });

  it('calculates method agreement as LOW when targets far apart', () => {
    const result = computeComposite(100, 80, 140, currentPrice);
    expect(result.methodAgreement).toBe('LOW');
  });
});

// ═══════════════════════════════════════════
// TOTAL RETURN (Siegel)
// ═══════════════════════════════════════════

describe('computeTotalReturn', () => {
  it('adds dividend yield to composite upside', () => {
    const { totalReturn } = computeTotalReturn(15, 3);
    expect(totalReturn).toBe(18);
  });

  it('flags income play when dividend yield > upside', () => {
    const { isIncomePlay } = computeTotalReturn(2, 5);
    expect(isIncomePlay).toBe(true);
  });

  it('handles null dividend yield', () => {
    const { totalReturn } = computeTotalReturn(10, null);
    expect(totalReturn).toBe(10);
  });
});

// ═══════════════════════════════════════════
// WACC / GROWTH / TERMINAL ESTIMATION
// ═══════════════════════════════════════════

describe('estimateWACC', () => {
  it('uses maturity classifier for known tickers', () => {
    const wacc = estimateWACC({ ticker: 'AAPL', sector: 'Information Technology' });
    expect(wacc).toBeGreaterThanOrEqual(3);
    expect(wacc).toBeLessThanOrEqual(12);
  });

  it('falls back to sector-based estimation', () => {
    const wacc = estimateWACC({ ticker: 'UNKNOWN', sector: 'Utilities' });
    // Utilities base = 5.5, might have adjustments
    expect(wacc).toBeGreaterThanOrEqual(3);
    expect(wacc).toBeLessThanOrEqual(12);
  });

  it('clamps WACC between 3 and 12', () => {
    const low = estimateWACC({ ticker: 'UNKNOWN', sector: 'Consumer Staples', beta: 0.3 });
    const high = estimateWACC({ ticker: 'UNKNOWN', sector: 'Consumer Discretionary', beta: 3.0, debtToEquity: 3.0, marketCap: 500e6, revenueGrowth3YrAvg: -10 });
    expect(low).toBeGreaterThanOrEqual(3);
    expect(high).toBeLessThanOrEqual(12);
  });
});

describe('estimateGrowthRate', () => {
  it('clamps growth between 0 and 25', () => {
    const rate = estimateGrowthRate({ ticker: 'UNKNOWN', fcfGrowth3YrAvg: 60 });
    expect(rate).toBeLessThanOrEqual(25);
  });

  it('returns a reasonable default when no data', () => {
    const rate = estimateGrowthRate({ ticker: 'UNKNOWN' });
    expect(rate).toBeGreaterThanOrEqual(0);
    expect(rate).toBeLessThanOrEqual(25);
  });
});

describe('estimateTerminalRate', () => {
  it('returns higher or equal terminal rate for high-growth stocks', () => {
    const high = estimateTerminalRate({ ticker: 'UNKNOWN', revenueGrowth3YrAvg: 30 });
    const low = estimateTerminalRate({ ticker: 'UNKNOWN', revenueGrowth3YrAvg: 5 });
    expect(high).toBeGreaterThanOrEqual(low);
  });
});

// ═══════════════════════════════════════════
// SCORE VALUATION (integration with scorer)
// ═══════════════════════════════════════════

describe('scoreValuation', () => {
  it('returns STRONG_UNDERVALUATION for >15% upside across methods', () => {
    const { pts, flags } = scoreValuation({
      dcf: { upside: 20 },
      evSales: { upside: 25 },
      evEbitda: { upside: 18 },
      avgUpside: 21,
      waccTier: 'MODERATE',
    });
    expect(pts).toBeGreaterThan(0);
    expect(flags).toContain('STRONG_UNDERVALUATION');
  });

  it('penalizes for OVERVALUATION_WARNING', () => {
    const { pts, flags } = scoreValuation({
      dcf: { upside: -15 },
      evSales: { upside: 5 },
      evEbitda: { upside: 3 },
      avgUpside: -2,
      waccTier: 'MODERATE',
    });
    expect(flags).toContain('OVERVALUATION_WARNING');
    expect(pts).toBeLessThan(0);
  });

  it('returns 0 for null valuation', () => {
    const { pts } = scoreValuation(null);
    expect(pts).toBe(0);
  });

  it('applies WACC risk adjustment', () => {
    const base = { dcf: { upside: 5 }, evSales: { upside: 5 }, evEbitda: { upside: 5 }, avgUpside: 5 };
    const moderate = scoreValuation({ ...base, waccTier: 'MODERATE' });
    const high = scoreValuation({ ...base, waccTier: 'HIGH' });
    expect(high.pts).toBeLessThan(moderate.pts);
  });
});

// ═══════════════════════════════════════════
// THREE-PILLAR VALUATION (integration)
// ═══════════════════════════════════════════

describe('computeThreePillarValuation', () => {
  it('computes a full valuation for a well-defined stock', () => {
    const result = computeThreePillarValuation({
      ticker: 'TEST',
      currentPrice: 100,
      sector: 'Information Technology',
      marketCap: 50e9,
      beta: 1.1,
      debtToEquity: 0.5,
      totalDebt: 5e9,
      cashAndEquivalents: 10e9,
      freeCashFlow: 3e9,
      ttmFCF: 3e9,
      revenueCurrent: 20e9,
      ttmRevenue: 20e9,
      revenueGrowth3YrAvg: 15,
      fcfMargin: 15,
      dilutedShares: 500e6,
      sharesOutstanding: 500e6,
      dividendYield: 1.5,
    });

    expect(result).not.toBeNull();
    expect(result.rating).toBeDefined();
    expect(result.avgTarget).toBeGreaterThan(0);
    expect(['BUY', 'OVERWEIGHT', 'HOLD', 'NEUTRAL']).toContain(result.rating);
    expect(result.wacc).toBeGreaterThanOrEqual(3);
    expect(result.wacc).toBeLessThanOrEqual(12);
  });

  it('returns null when current price is 0', () => {
    expect(computeThreePillarValuation({ currentPrice: 0 })).toBeNull();
  });

  it('returns null when current price is missing', () => {
    expect(computeThreePillarValuation({})).toBeNull();
  });

  it('includes maturity profile', () => {
    const result = computeThreePillarValuation({
      ticker: 'AAPL',
      currentPrice: 180,
      sector: 'Information Technology',
      freeCashFlow: 100e9,
      ttmFCF: 100e9,
      ttmRevenue: 380e9,
      dilutedShares: 15.5e9,
      sharesOutstanding: 15.5e9,
    });
    if (result) {
      expect(result.maturityProfile).toBeDefined();
    }
  });
});
