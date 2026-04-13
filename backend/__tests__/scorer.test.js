const {
  runScorer,
  getSignal,
  determineSignal,
  scoreFundamentalV1,
  scoreTechnical,
  scoreRevenueGrowth,
  scoreGrowthMomentum,
  scoreFCF,
  scoreMoat,
  scoreValuationVsPeers,
  scoreBalanceSheet,
  scoreFundamentalBonuses,
  scoreFundamentalPenalties,
  scoreEarningsQuality,
} = require('../services/scorer');

// ═══════════════════════════════════════════
// SIGNAL DETERMINATION
// ═══════════════════════════════════════════

describe('getSignal', () => {
  it('returns LOAD THE BOAT for scores >= 75', () => {
    expect(getSignal(75)).toBe('LOAD THE BOAT');
    expect(getSignal(100)).toBe('LOAD THE BOAT');
  });

  it('returns ACCUMULATE for scores 60-74', () => {
    expect(getSignal(60)).toBe('ACCUMULATE');
    expect(getSignal(74)).toBe('ACCUMULATE');
  });

  it('returns WATCH for scores 40-59', () => {
    expect(getSignal(40)).toBe('WATCH');
    expect(getSignal(59)).toBe('WATCH');
  });

  it('returns PASS for scores below 40', () => {
    expect(getSignal(0)).toBe('PASS');
    expect(getSignal(39)).toBe('PASS');
  });
});

describe('determineSignal', () => {
  it('overrides to VALUE_TRAP when flag present', () => {
    expect(determineSignal(90, ['VALUE_TRAP'])).toBe('VALUE_TRAP');
  });

  it('overrides to FUNDAMENTAL_DETERIORATION on THESIS_BROKEN', () => {
    expect(determineSignal(80, ['THESIS_BROKEN'])).toBe('FUNDAMENTAL_DETERIORATION');
  });

  it('overrides to FUNDAMENTAL_DETERIORATION on EXIT_IMMEDIATELY', () => {
    expect(determineSignal(80, ['EXIT_IMMEDIATELY'])).toBe('FUNDAMENTAL_DETERIORATION');
  });

  it('overrides to GENERATIONAL_BUY when flag present', () => {
    expect(determineSignal(50, ['GENERATIONAL_BUY'])).toBe('GENERATIONAL_BUY');
  });

  it('falls through to score-based signal when no override flags', () => {
    expect(determineSignal(80, ['DIV_5PCT'])).toBe('LOAD THE BOAT');
    expect(determineSignal(50, [])).toBe('WATCH');
  });
});

// ═══════════════════════════════════════════
// FUNDAMENTAL SUB-SCORES
// ═══════════════════════════════════════════

describe('scoreRevenueGrowth', () => {
  it('scores 20 for >30% growth', () => {
    expect(scoreRevenueGrowth({ revenueGrowth3YrAvg: 35 }).pts).toBe(20);
  });

  it('scores 15 for >20% growth', () => {
    expect(scoreRevenueGrowth({ revenueGrowth3YrAvg: 25 }).pts).toBe(15);
  });

  it('scores 8 for >10% growth', () => {
    expect(scoreRevenueGrowth({ revenueGrowth3YrAvg: 15 }).pts).toBe(8);
  });

  it('scores 3 for >0% growth', () => {
    expect(scoreRevenueGrowth({ revenueGrowth3YrAvg: 5 }).pts).toBe(3);
  });

  it('scores 0 with THESIS_BROKEN flag for declining revenue', () => {
    const result = scoreRevenueGrowth({ revenueGrowth3YrAvg: -5 });
    expect(result.pts).toBe(0);
    expect(result.flag).toBe('THESIS_BROKEN');
  });

  it('returns 0 for null/undefined data', () => {
    expect(scoreRevenueGrowth({}).pts).toBe(0);
    expect(scoreRevenueGrowth({ revenueGrowth3YrAvg: null }).pts).toBe(0);
  });

  it('handles NaN and Infinity gracefully', () => {
    expect(scoreRevenueGrowth({ revenueGrowth3YrAvg: NaN }).pts).toBe(0);
    expect(scoreRevenueGrowth({ revenueGrowth3YrAvg: Infinity }).pts).toBe(0);
  });
});

describe('scoreGrowthMomentum', () => {
  it('scores 5 for accelerating growth', () => {
    expect(scoreGrowthMomentum({ revenueGrowthQoQ: 20, revenueGrowthPriorQoQ: 10 }).pts).toBe(5);
  });

  it('returns EXIT_IMMEDIATELY flag for >50% collapse', () => {
    const result = scoreGrowthMomentum({ revenueGrowthQoQ: 5, revenueGrowthPriorQoQ: 20 });
    expect(result.flag).toBe('EXIT_IMMEDIATELY');
    expect(result.pts).toBe(-10);
  });

  it('returns LAFFONT_EXIT_SIGNAL for >25% deceleration', () => {
    const result = scoreGrowthMomentum({ revenueGrowthQoQ: 12, revenueGrowthPriorQoQ: 20 });
    expect(result.flag).toBe('LAFFONT_EXIT_SIGNAL');
    expect(result.pts).toBe(-5);
  });

  it('scores 0 for missing data', () => {
    expect(scoreGrowthMomentum({}).pts).toBe(0);
  });
});

describe('scoreFCF', () => {
  it('scores 10 for strong FCF margin >20% and growing', () => {
    expect(scoreFCF({ fcfMargin: 25, fcfGrowthYoY: 10 }).pts).toBe(10);
  });

  it('scores 7 for positive FCF margin >10% and growing', () => {
    expect(scoreFCF({ fcfMargin: 15, fcfGrowthYoY: 5 }).pts).toBe(7);
  });

  it('scores 3 for positive FCF margin', () => {
    expect(scoreFCF({ fcfMargin: 8, fcfGrowthYoY: -2 }).pts).toBe(3);
  });

  it('scores 0 with FCF_NEGATIVE flag for negative and worsening', () => {
    const result = scoreFCF({ fcfMargin: -10, fcfGrowthYoY: -5 });
    expect(result.pts).toBe(0);
    expect(result.flag).toBe('FCF_NEGATIVE');
  });

  it('scores 1 for negative but improving', () => {
    expect(scoreFCF({ fcfMargin: -3, fcfGrowthYoY: 5 }).pts).toBe(1);
  });
});

describe('scoreMoat', () => {
  it('scores 5 for MONOPOLY', () => {
    expect(scoreMoat('MONOPOLY').pts).toBe(5);
  });

  it('scores 4 for STRONG_PLATFORM', () => {
    expect(scoreMoat('STRONG_PLATFORM').pts).toBe(4);
  });

  it('scores 2 for MODERATE', () => {
    expect(scoreMoat('MODERATE').pts).toBe(2);
  });

  it('scores 0 for NONE', () => {
    expect(scoreMoat('NONE').pts).toBe(0);
  });

  it('scores 0 for null/unknown', () => {
    expect(scoreMoat(null).pts).toBe(0);
    expect(scoreMoat(undefined).pts).toBe(0);
  });
});

describe('scoreValuationVsPeers', () => {
  it('scores 5 for >50% discount to sector', () => {
    expect(scoreValuationVsPeers({ forwardPE: 10, sectorAvgPE: 25 }).pts).toBe(5);
  });

  it('scores 3 for >25% discount', () => {
    expect(scoreValuationVsPeers({ forwardPE: 15, sectorAvgPE: 25 }).pts).toBe(3);
  });

  it('scores 0 for premium to peers', () => {
    expect(scoreValuationVsPeers({ forwardPE: 30, sectorAvgPE: 20 }).pts).toBe(0);
  });

  it('scores 0 for missing data', () => {
    expect(scoreValuationVsPeers({}).pts).toBe(0);
    expect(scoreValuationVsPeers({ forwardPE: 10 }).pts).toBe(0);
  });

  it('falls back to peRatio when forwardPE missing', () => {
    expect(scoreValuationVsPeers({ peRatio: 10, sectorAvgPE: 25 }).pts).toBe(5);
  });
});

describe('scoreBalanceSheet', () => {
  it('scores 5 for net cash + buybacks', () => {
    const result = scoreBalanceSheet({
      cashAndEquivalents: 10e9,
      totalDebt: 2e9,
      sharesOutstandingChange: -0.05,
    });
    expect(result.pts).toBe(5);
  });

  it('scores 4 for net cash without buybacks', () => {
    const result = scoreBalanceSheet({
      cashAndEquivalents: 10e9,
      totalDebt: 2e9,
      sharesOutstandingChange: 0.01,
    });
    expect(result.pts).toBe(4);
  });

  it('flags HIGH_DEBT for debtToEquity > 2.0', () => {
    const result = scoreBalanceSheet({ debtToEquity: 3.0 });
    expect(result.pts).toBe(0);
    expect(result.flag).toBe('HIGH_DEBT');
  });
});

// ═══════════════════════════════════════════
// TECHNICAL SCORE
// ═══════════════════════════════════════════

describe('scoreTechnical', () => {
  it('scores max 50 when below both 200WMA and 200MMA', () => {
    expect(scoreTechnical({ pctFrom200WMA: -5, pctFrom200MMA: -5 })).toBe(50);
  });

  it('scores 25 for below 200WMA, 20 for near 200MMA', () => {
    expect(scoreTechnical({ pctFrom200WMA: -1, pctFrom200MMA: 2 })).toBe(45);
  });

  it('scores 0 when far above both MAs', () => {
    expect(scoreTechnical({ pctFrom200WMA: 20, pctFrom200MMA: 20 })).toBe(0);
  });

  it('handles null values', () => {
    expect(scoreTechnical({ pctFrom200WMA: null, pctFrom200MMA: null })).toBe(0);
    expect(scoreTechnical({ pctFrom200WMA: -5, pctFrom200MMA: null })).toBe(25);
  });
});

// ═══════════════════════════════════════════
// V1 FUNDAMENTAL SCORE
// ═══════════════════════════════════════════

describe('scoreFundamentalV1', () => {
  it('scores high for strong fundamentals', () => {
    const score = scoreFundamentalV1({
      revenueGrowthPct: 25,
      pctFrom52wHigh: -50,
      psRatio: 0.8,
      peRatio: 8,
    });
    // 15 (rev) + 12 (drawdown) + 10 (ps) + 10 (pe) = 47
    expect(score).toBe(47);
  });

  it('scores 0 for all null inputs', () => {
    expect(scoreFundamentalV1({})).toBe(0);
  });

  it('handles negative and zero values safely', () => {
    const score = scoreFundamentalV1({
      revenueGrowthPct: -5,
      pctFrom52wHigh: 0,
      psRatio: -1,
      peRatio: 0,
    });
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════
// BONUSES
// ═══════════════════════════════════════════

describe('scoreFundamentalBonuses', () => {
  it('awards dividend bonus for >7% yield', () => {
    const { bonus, flags } = scoreFundamentalBonuses({ dividendYield: 8 }, null);
    expect(bonus).toBe(8);
    expect(flags).toContain('DIV_7PCT');
  });

  it('awards institutional bonuses for multiple new buys', () => {
    const { bonus, flags } = scoreFundamentalBonuses({}, { newBuysThisQuarter: 3, superInvestorCount: 0 });
    expect(bonus).toBe(12);
    expect(flags).toContain('MULTI_NEW_BUY');
  });

  it('awards SAIN full stack consensus bonus', () => {
    const { bonus, flags } = scoreFundamentalBonuses(
      { sainConsensus: { is_full_stack_consensus: true, layers_aligned: 4, politician_score: 0, ai_model_score: 0 } },
      null,
    );
    expect(bonus).toBe(15);
    expect(flags).toContain('FULL_STACK_CONSENSUS');
  });

  it('returns 0 bonus with no qualifying data', () => {
    const { bonus } = scoreFundamentalBonuses({}, null);
    expect(bonus).toBe(0);
  });
});

// ═══════════════════════════════════════════
// PENALTIES
// ═══════════════════════════════════════════

describe('scoreFundamentalPenalties', () => {
  it('applies VALUE_TRAP penalty', () => {
    const stock = { revenueGrowth3YrAvg: 25, fcfMargin: -5, peRatio: 150 };
    const { penalty, flags } = scoreFundamentalPenalties(stock, null, null);
    expect(penalty).toBe(-15);
    expect(flags).toContain('VALUE_TRAP');
  });

  it('applies SUPER_INVESTOR_DUMPING penalty', () => {
    const { penalty, flags } = scoreFundamentalPenalties({}, { largestReductionPct: 60, consecutiveQuarterlyReductions: 0 }, null);
    expect(penalty).toBe(-5);
    expect(flags).toContain('SUPER_INVESTOR_DUMPING');
  });

  it('applies EARNINGS_PROXIMITY penalty', () => {
    const { penalty, flags } = scoreFundamentalPenalties({ earningsWithin14Days: true }, null, null);
    expect(penalty).toBe(-15);
    expect(flags).toContain('EARNINGS_PROXIMITY');
  });

  it('applies LATE_CYCLE_CONTEXT penalty', () => {
    const { penalty, flags } = scoreFundamentalPenalties({}, null, { lateCycleScore: 4 });
    expect(penalty).toBe(-5);
    expect(flags).toContain('LATE_CYCLE_CONTEXT');
  });

  it('returns 0 penalty with no qualifying data', () => {
    const { penalty } = scoreFundamentalPenalties({}, null, null);
    expect(penalty).toBe(0);
  });
});

// ═══════════════════════════════════════════
// EARNINGS QUALITY
// ═══════════════════════════════════════════

describe('scoreEarningsQuality', () => {
  it('adjusts +2 when FCF confirms earnings', () => {
    const { adjustment, flags } = scoreEarningsQuality({ fcfPerShare: 5, epsGaap: 3 });
    expect(adjustment).toBe(2);
    expect(flags).toContain('FCF_CONFIRMS_EARNINGS');
  });

  it('adjusts -3 for FCF/earnings disconnect', () => {
    const { adjustment, flags } = scoreEarningsQuality({ fcfPerShare: 1, epsGaap: 5 });
    expect(adjustment).toBe(-3);
    expect(flags).toContain('FCF_EARNINGS_DISCONNECT');
  });

  it('adjusts -2 for GAAP/non-GAAP divergence', () => {
    const { adjustment, flags } = scoreEarningsQuality({ gaapNonGaapDivergence: 30 });
    expect(adjustment).toBe(-2);
    expect(flags).toContain('GAAP_NONGAAP_DIVERGENCE');
  });
});

// ═══════════════════════════════════════════
// FULL SCORER INTEGRATION
// ═══════════════════════════════════════════

describe('runScorer', () => {
  const baseStock = {
    currentPrice: 100,
    week52High: 150,
    week52Low: 80,
    price200WMA: 110,
    price200MMA: 105,
    revenueGrowthPct: 25,
    psRatio: 3,
    peRatio: 15,
  };

  it('produces a valid score result with all required fields', () => {
    const result = runScorer(baseStock);
    expect(result).toHaveProperty('totalScore');
    expect(result).toHaveProperty('signal');
    expect(result).toHaveProperty('entryZone');
    expect(result).toHaveProperty('flags');
    expect(result).toHaveProperty('scoreBreakdown');
    expect(result.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.totalScore).toBeLessThanOrEqual(100);
  });

  it('never returns NaN for totalScore', () => {
    // Edge case: all nulls
    const result = runScorer({});
    expect(Number.isNaN(result.totalScore)).toBe(false);
  });

  it('caps totalScore between 0 and 100', () => {
    // Massive bonuses that could push over 100
    const result = runScorer({
      ...baseStock,
      revenueGrowth3YrAvg: 50,
      fcfMargin: 30,
      fcfGrowthYoY: 20,
      moatTier: 'MONOPOLY',
      dividendYield: 8,
      institutionalData: { newBuysThisQuarter: 3, superInvestorCount: 3, consecutiveQuarterlyAdds: 4, hasCallOptions: true },
    });
    expect(result.totalScore).toBeLessThanOrEqual(100);
  });

  it('detects entry zone when price is below 200WMA', () => {
    const result = runScorer({
      ...baseStock,
      currentPrice: 100,
      price200WMA: 110,
      price200MMA: 115,
    });
    expect(result.entryZone).toBe(true);
  });

  it('correctly identifies pctFrom200WMA', () => {
    const result = runScorer({
      currentPrice: 90,
      price200WMA: 100,
      price200MMA: 100,
    });
    expect(result.pctFrom200WMA).toBe(-10);
  });

  it('falls back to v1 scoring when no v2 data available', () => {
    const result = runScorer({
      currentPrice: 100,
      week52High: 150,
      week52Low: 50,
      price200WMA: 110,
      price200MMA: 105,
      revenueGrowthPct: 25,
      psRatio: 2,
      peRatio: 12,
    });
    expect(result.scoreV1).toBeGreaterThan(0);
    expect(result.fundamentalScoreV1).toBeGreaterThan(0);
  });
});
