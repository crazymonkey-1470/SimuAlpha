/**
 * TLI Scoring Algorithm v2 — The Long Investor methodology
 *
 * FUNDAMENTAL BASE (50 pts) + TECHNICAL (50 pts) + BONUSES + PENALTIES = TOTAL
 *
 * Fundamental breakdown:
 *   Revenue Growth (20pts) + Growth Momentum (5pts) + FCF (10pts)
 *   + Moat (5pts) + Valuation vs Peers (5pts) + Balance Sheet (5pts)
 *
 * If any input is null, that component scores 0 (skipped gracefully).
 * Never returns NaN.
 */

// ═══════════════════════════════════════════
// FUNDAMENTAL SUB-SCORES (50pts base)
// ═══════════════════════════════════════════

// 1A. Revenue Growth (20pts) — 3-year average, not single quarter (Graham Ch.12)
function scoreRevenueGrowth(stock) {
  const avgGrowth = stock.revenueGrowth3YrAvg;
  if (avgGrowth == null || !isFinite(avgGrowth)) return { pts: 0, label: 'No data' };

  if (avgGrowth > 30) return { pts: 20, label: 'Accelerating >30%' };
  if (avgGrowth > 20) return { pts: 15, label: 'Stable >20%' };
  if (avgGrowth > 10) return { pts: 8, label: 'Growing >10%' };
  if (avgGrowth > 0) return { pts: 3, label: 'Growing >0%' };
  return { pts: 0, flag: 'THESIS_BROKEN', label: 'Declining revenue' };
}

// 1B. Growth Momentum (5pts) — compare recent vs prior quarter growth
function scoreGrowthMomentum(stock) {
  const curr = stock.revenueGrowthQoQ;
  const prior = stock.revenueGrowthPriorQoQ;
  if (curr == null || prior == null || !isFinite(curr) || !isFinite(prior)) {
    return { pts: 0, label: 'No quarterly data' };
  }

  if (curr > prior) return { pts: 5, label: 'Accelerating' };

  // Laffont exit signal: severe deceleration
  if (prior > 0) {
    const decelPct = ((prior - curr) / prior) * 100;
    if (decelPct > 50) return { pts: -10, flag: 'EXIT_IMMEDIATELY', label: 'Growth collapsed >50%' };
    if (decelPct > 25) return { pts: -5, flag: 'LAFFONT_EXIT_SIGNAL', label: 'Growth decelerating >25%' };
  }
  return { pts: 0, label: 'Stable growth' };
}

// 1C. FCF Profitability (10pts) — NON-NEGOTIABLE (Berkshire + Cohen + Laffont consensus)
function scoreFCF(stock) {
  const fcfMargin = stock.fcfMargin;
  const fcfGrowth = stock.fcfGrowthYoY;

  if (fcfMargin == null || !isFinite(fcfMargin)) return { pts: 0, label: 'No FCF data' };

  if (fcfMargin > 20 && fcfGrowth > 0) return { pts: 10, label: 'FCF strong + growing' };
  if (fcfMargin > 10 && fcfGrowth > 0) return { pts: 7, label: 'FCF positive + growing' };
  if (fcfMargin > 0) return { pts: 3, label: 'FCF positive' };
  if (fcfMargin > -5 && fcfGrowth > 0) return { pts: 1, label: 'FCF negative but improving' };
  return { pts: 0, flag: 'FCF_NEGATIVE', label: 'FCF negative + worsening' };
}

// 1D. Moat Strength (5pts) — from Claude analysis or manual override
function scoreMoat(moatTier) {
  const tiers = {
    'MONOPOLY': 5,
    'STRONG_PLATFORM': 4,
    'MODERATE': 2,
    'NONE': 0,
  };
  const pts = tiers[moatTier] || 0;
  return { pts, label: moatTier || 'Unclassified' };
}

// 1E. Valuation vs Peers (5pts) — forward P/E discount to sector average
function scoreValuationVsPeers(stock) {
  const forwardPE = stock.forwardPE || stock.peRatio;
  const sectorAvgPE = stock.sectorAvgPE;
  if (forwardPE == null || sectorAvgPE == null || !isFinite(forwardPE) || !isFinite(sectorAvgPE) || sectorAvgPE <= 0) {
    return { pts: 0, label: 'No peer data' };
  }

  const discount = ((sectorAvgPE - forwardPE) / sectorAvgPE) * 100;

  if (discount > 50) return { pts: 5, label: '>50% discount to sector' };
  if (discount > 25) return { pts: 3, label: '>25% discount' };
  if (discount > 0) return { pts: 1, label: 'At sector average' };
  return { pts: 0, label: 'Premium to peers' };
}

// 1F. Balance Sheet (5pts)
function scoreBalanceSheet(stock) {
  const netCash = (stock.cashAndEquivalents || 0) - (stock.totalDebt || 0);
  const hasBuybacks = stock.sharesOutstandingChange != null && stock.sharesOutstandingChange < -0.01;
  const debtToEquity = stock.debtToEquity;

  if (netCash > 0 && hasBuybacks) return { pts: 5, label: 'Net cash + buybacks' };
  if (netCash > 0) return { pts: 4, label: 'Net cash' };
  if (debtToEquity != null && debtToEquity < 0.5) return { pts: 2, label: 'Low debt' };
  if (debtToEquity != null && debtToEquity > 2.0) return { pts: 0, flag: 'HIGH_DEBT', label: 'High debt' };
  return { pts: 1, label: 'Moderate debt' };
}


// ═══════════════════════════════════════════
// BONUS POINTS (can push above 50 base)
// ═══════════════════════════════════════════

function scoreFundamentalBonuses(stock, inst) {
  let bonus = 0;
  const flags = [];

  // Dividend bonus
  const divYield = stock.dividendYield;
  if (divYield != null && divYield > 7) { bonus += 8; flags.push('DIV_7PCT'); }
  else if (divYield != null && divYield > 5) { bonus += 5; flags.push('DIV_5PCT'); }
  else if (divYield != null && divYield > 3) { bonus += 3; flags.push('DIV_3PCT'); }

  // Institutional confirmation (from institutional tracker)
  if (inst) {
    if (inst.newBuysThisQuarter >= 2) { bonus += 12; flags.push('MULTI_NEW_BUY'); }
    else if (inst.newBuysThisQuarter >= 1) { bonus += 8; flags.push('NEW_SUPER_BUY'); }

    if (inst.superInvestorCount >= 2) { bonus += 6; flags.push('MULTI_INVESTOR'); }
    else if (inst.superInvestorCount >= 1) { bonus += 3; flags.push('SINGLE_INVESTOR'); }

    if (inst.consecutiveQuarterlyAdds >= 3) { bonus += 5; flags.push('DCA_CONVICTION'); }
    if (inst.hasCallOptions) { bonus += 5; flags.push('EXTREME_CONVICTION_CALLS'); }
  }

  // Business model quality
  if (stock.grossMarginCurrent > 70 && stock.fcfMargin > 20) {
    bonus += 5; flags.push('HIGH_QUALITY_SAAS');
  }

  if (stock.sharesOutstandingChange != null && stock.sharesOutstandingChange < -0.02) {
    bonus += 2; flags.push('BUYBACK_PROGRAM');
  }

  // Cyclical recovery (Tepper style)
  if (stock.forwardPE != null && stock.forwardPE < 10 && stock.sector === 'INDUSTRIALS') {
    bonus += 3; flags.push('CYCLICAL_RECOVERY');
  }

  // SAIN consensus bonuses (Sprint 9A)
  if (stock.sainConsensus) {
    const sc = stock.sainConsensus;
    if (sc.is_full_stack_consensus) {
      bonus += 15; flags.push('FULL_STACK_CONSENSUS');
    } else if (sc.layers_aligned >= 3) {
      bonus += 8; flags.push('THREE_LAYER_CONSENSUS');
    }
    if (sc.politician_score >= 5) {
      bonus += 5; flags.push('POLITICIAN_CONVICTION');
    } else if (sc.politician_score >= 2) {
      bonus += 2; flags.push('POLITICIAN_SIGNAL');
    }
    if (sc.ai_model_score >= 4) {
      bonus += 4; flags.push('AI_MODEL_CONSENSUS');
    } else if (sc.ai_model_score >= 2) {
      bonus += 2; flags.push('AI_MODEL_SIGNAL');
    }
  }

  return { bonus, flags };
}


// ═══════════════════════════════════════════
// PENALTIES
// ═══════════════════════════════════════════

function scoreFundamentalPenalties(stock, inst, macroCtx) {
  let penalty = 0;
  const flags = [];

  // Value trap detector (Cohen SNOW lesson)
  if (stock.revenueGrowth3YrAvg > 20 && stock.fcfMargin != null && stock.fcfMargin < 0
      && stock.peRatio != null && stock.peRatio > 100) {
    penalty -= 15;
    flags.push('VALUE_TRAP');
  }

  // Earnings quality: GAAP vs non-GAAP divergence
  if (stock.gaapNonGaapDivergence != null && stock.gaapNonGaapDivergence > 20) {
    penalty -= 2; flags.push('GAAP_NONGAAP_DIVERGENCE');
  }

  // Institutional sell signals
  if (inst) {
    if (inst.largestReductionPct > 50) {
      penalty -= 5; flags.push('SUPER_INVESTOR_DUMPING');
    }
    if (inst.consecutiveQuarterlyReductions >= 3) {
      penalty -= 8; flags.push('SUSTAINED_EXIT_SIGNAL');
    }
    if (inst.rapidAbandonment) {
      penalty -= 3; flags.push('RAPID_THESIS_FAILURE');
    }
  }

  // Late cycle context
  if (macroCtx && macroCtx.lateCycleScore >= 3) {
    penalty -= 5; flags.push('LATE_CYCLE_CONTEXT');
  }

  // Earnings proximity
  if (stock.earningsWithin14Days) {
    penalty -= 15; flags.push('EARNINGS_PROXIMITY');
  }

  // AI capex risk (Berkshire AMZN sell rationale)
  if (stock.capex != null) {
    if (stock.capex > 100e9 && stock.fcfMargin != null && stock.fcfMargin < 15) {
      penalty -= 5; flags.push('AI_CAPEX_RISK');
    } else if (stock.capex > 50e9 && stock.fcfMargin != null && stock.fcfMargin < 10) {
      penalty -= 3; flags.push('CAPEX_CREDIBILITY_RISK');
    }
  }

  // Carry trade vulnerability
  if (macroCtx && macroCtx.carryTradeRisk === 'HIGH') {
    if (stock.debtToEquity != null && stock.debtToEquity > 2.0) {
      penalty -= 5; flags.push('DEBT_CARRY_RISK');
    }
  }

  return { penalty, flags };
}


// ═══════════════════════════════════════════
// EARNINGS QUALITY SCANNER (Graham Ch.12)
// ═══════════════════════════════════════════

function scoreEarningsQuality(stock) {
  let adjustment = 0;
  const flags = [];

  // GAAP vs Non-GAAP divergence > 20%
  if (stock.gaapNonGaapDivergence != null && stock.gaapNonGaapDivergence > 20) {
    adjustment -= 2;
    flags.push('GAAP_NONGAAP_DIVERGENCE');
  }

  // FCF per share > EPS = genuine earnings (hard to fake)
  const fcfPerShare = stock.fcfPerShare;
  const epsGaap = stock.epsGaap;
  if (fcfPerShare != null && epsGaap != null) {
    if (fcfPerShare > epsGaap) {
      adjustment += 2;
      flags.push('FCF_CONFIRMS_EARNINGS');
    } else if (fcfPerShare < epsGaap * 0.5) {
      adjustment -= 3;
      flags.push('FCF_EARNINGS_DISCONNECT');
    }
  }

  return { adjustment, flags };
}


// ═══════════════════════════════════════════
// TECHNICAL SCORE (unchanged from v1)
// ═══════════════════════════════════════════

function scoreTechnical({ pctFrom200WMA, pctFrom200MMA }) {
  let score = 0;

  if (pctFrom200WMA != null && isFinite(pctFrom200WMA)) {
    if (pctFrom200WMA <= 0) score += 25;
    else if (pctFrom200WMA <= 3) score += 20;
    else if (pctFrom200WMA <= 8) score += 12;
    else if (pctFrom200WMA <= 15) score += 5;
  }

  if (pctFrom200MMA != null && isFinite(pctFrom200MMA)) {
    if (pctFrom200MMA <= 0) score += 25;
    else if (pctFrom200MMA <= 3) score += 20;
    else if (pctFrom200MMA <= 8) score += 12;
    else if (pctFrom200MMA <= 10) score += 5;
  }

  return score;
}


// ═══════════════════════════════════════════
// LEGACY FUNDAMENTAL SCORE (preserved as v1)
// ═══════════════════════════════════════════

function scoreFundamentalV1({ revenueGrowthPct, pctFrom52wHigh, psRatio, peRatio }) {
  let score = 0;

  if (revenueGrowthPct != null && isFinite(revenueGrowthPct)) {
    if (revenueGrowthPct >= 20) score += 15;
    else if (revenueGrowthPct >= 10) score += 10;
    else if (revenueGrowthPct > 0) score += 5;
  }

  if (pctFrom52wHigh != null && isFinite(pctFrom52wHigh)) {
    const pctBelow = Math.abs(pctFrom52wHigh);
    if (pctBelow >= 60) score += 15;
    else if (pctBelow >= 40) score += 12;
    else if (pctBelow >= 25) score += 8;
    else if (pctBelow >= 15) score += 4;
  }

  if (psRatio != null && isFinite(psRatio) && psRatio > 0) {
    if (psRatio < 1) score += 10;
    else if (psRatio < 3) score += 7;
    else if (psRatio < 5) score += 4;
    else if (psRatio < 10) score += 2;
  }

  if (peRatio != null && isFinite(peRatio) && peRatio > 0) {
    if (peRatio < 10) score += 10;
    else if (peRatio < 15) score += 7;
    else if (peRatio < 20) score += 4;
    else if (peRatio < 30) score += 2;
  }

  return score;
}


// ═══════════════════════════════════════════
// SIGNAL DETERMINATION
// ═══════════════════════════════════════════

function getSignal(totalScore) {
  if (totalScore >= 75) return 'LOAD THE BOAT';
  if (totalScore >= 60) return 'ACCUMULATE';
  if (totalScore >= 40) return 'WATCH';
  return 'PASS';
}

function determineSignal(totalScore, allFlags) {
  // VALUE_TRAP overrides everything
  if (allFlags.includes('VALUE_TRAP')) return 'VALUE_TRAP';
  if (allFlags.includes('THESIS_BROKEN') || allFlags.includes('EXIT_IMMEDIATELY'))
    return 'FUNDAMENTAL_DETERIORATION';

  // Wave-based overrides
  if (allFlags.includes('GENERATIONAL_BUY')) return 'GENERATIONAL_BUY';

  // Score-based
  return getSignal(totalScore);
}


// ═══════════════════════════════════════════
// ENTRY ZONE DETECTION (unchanged)
// ═══════════════════════════════════════════

function getEntryZone({ currentPrice, price200WMA, price200MMA, pctFrom200WMA, pctFrom200MMA }) {
  const belowWMA = pctFrom200WMA != null && pctFrom200WMA <= 0;
  const belowMMA = pctFrom200MMA != null && pctFrom200MMA <= 0;
  const nearWMA = pctFrom200WMA != null && pctFrom200WMA > 0 && pctFrom200WMA <= 3;
  const nearMMA = pctFrom200MMA != null && pctFrom200MMA > 0 && pctFrom200MMA <= 3;
  const within8WMA = pctFrom200WMA != null && pctFrom200WMA <= 8;
  const within8MMA = pctFrom200MMA != null && pctFrom200MMA <= 8;

  let entryZone = false;
  let entryNote = '';

  if (belowWMA && belowMMA) {
    entryZone = true;
    entryNote = `Price $${f(currentPrice)} is below BOTH 200WMA ($${f(price200WMA)}) and 200MMA ($${f(price200MMA)}) — best entry zone`;
  } else if (belowWMA || belowMMA) {
    entryZone = true;
    const which = belowWMA ? '200WMA' : '200MMA';
    const ma = belowWMA ? price200WMA : price200MMA;
    entryNote = `Price $${f(currentPrice)} is below ${which} ($${f(ma)}) — good entry zone`;
  } else if (nearWMA || nearMMA) {
    entryZone = true;
    entryNote = `Price $${f(currentPrice)} is within 3% of ${nearWMA ? '200WMA' : '200MMA'} — entry zone approaching`;
  } else if (within8WMA || within8MMA) {
    entryZone = false;
    const pctAbove = pctFrom200WMA != null && pctFrom200MMA != null
      ? Math.min(pctFrom200WMA, pctFrom200MMA)
      : (pctFrom200WMA ?? pctFrom200MMA ?? 0);
    const target = price200WMA != null ? price200WMA : price200MMA;
    entryNote = `Price $${f(currentPrice)} is ${f(pctAbove, 1)}% above MA — wait for pullback to $${f(target)}`;
  } else {
    entryZone = false;
    entryNote = `Price $${f(currentPrice)} is above both MAs — wait for pullback`;
  }

  return { entryZone, entryNote };
}

function f(val, dec = 2) {
  if (val == null || !isFinite(val)) return '—';
  return Number(val).toFixed(dec);
}


// ═══════════════════════════════════════════
// MAIN SCORER — V2
// ═══════════════════════════════════════════

function runScorer({ currentPrice, week52High, week52Low, price200WMA, price200MMA, revenueGrowthPct, psRatio, peRatio, ...opts }) {
  const pctFrom52wHigh = (week52High != null && currentPrice != null && week52High > 0)
    ? ((currentPrice - week52High) / week52High) * 100
    : null;

  const pctFrom200WMA = (price200WMA != null && currentPrice != null && price200WMA > 0)
    ? ((currentPrice - price200WMA) / price200WMA) * 100
    : null;

  const pctFrom200MMA = (price200MMA != null && currentPrice != null && price200MMA > 0)
    ? ((currentPrice - price200MMA) / price200MMA) * 100
    : null;

  // ── V1 scoring (preserved for comparison) ──
  const fundamentalScoreV1 = scoreFundamentalV1({ revenueGrowthPct, pctFrom52wHigh, psRatio, peRatio });
  const technicalScore = scoreTechnical({ pctFrom200WMA, pctFrom200MMA });
  const scoreV1 = fundamentalScoreV1 + technicalScore;

  // ── V2 fundamental sub-scores ──
  const stockData = {
    revenueGrowth3YrAvg: opts.revenueGrowth3YrAvg ?? null,
    revenueGrowthQoQ: opts.revenueGrowthQoQ ?? null,
    revenueGrowthPriorQoQ: opts.revenueGrowthPriorQoQ ?? null,
    fcfMargin: opts.fcfMargin ?? null,
    fcfGrowthYoY: opts.fcfGrowthYoY ?? null,
    moatTier: opts.moatTier ?? null,
    forwardPE: opts.forwardPE ?? peRatio,
    sectorAvgPE: opts.sectorAvgPE ?? null,
    peRatio: peRatio,
    psRatio: psRatio,
    cashAndEquivalents: opts.cashAndEquivalents ?? null,
    totalDebt: opts.totalDebt ?? null,
    debtToEquity: opts.debtToEquity ?? null,
    sharesOutstandingChange: opts.sharesOutstandingChange ?? null,
    dividendYield: opts.dividendYield ?? null,
    grossMarginCurrent: opts.grossMarginCurrent ?? null,
    capex: opts.capex ?? null,
    earningsWithin14Days: opts.earningsWithin14Days ?? false,
    epsGaap: opts.epsGaap ?? null,
    fcfPerShare: opts.fcfPerShare ?? null,
    gaapNonGaapDivergence: opts.gaapNonGaapDivergence ?? null,
    sector: opts.sector ?? null,
    revenueGrowthPct: revenueGrowthPct,
    sainConsensus: opts.sainConsensus ?? null,
  };

  const revenue = scoreRevenueGrowth(stockData);
  const momentum = scoreGrowthMomentum(stockData);
  const fcf = scoreFCF(stockData);
  const moat = scoreMoat(stockData.moatTier);
  const valuation = scoreValuationVsPeers(stockData);
  const balanceSheet = scoreBalanceSheet(stockData);

  // If no v2 data available, fallback to v1 fundamental score
  const hasV2Data = stockData.revenueGrowth3YrAvg != null || stockData.fcfMargin != null
    || stockData.cashAndEquivalents != null;

  const fundamentalBase = hasV2Data
    ? Math.min(50, revenue.pts + momentum.pts + fcf.pts + moat.pts + valuation.pts + balanceSheet.pts)
    : fundamentalScoreV1;

  let totalScore = fundamentalBase + technicalScore;

  // ── Institutional intelligence ──
  const inst = opts.institutionalData || null;
  const macroCtx = opts.macroContext || null;
  const bonuses = scoreFundamentalBonuses(stockData, inst);
  const penalties = scoreFundamentalPenalties(stockData, inst, macroCtx);
  const earningsQuality = scoreEarningsQuality(stockData);

  totalScore += bonuses.bonus + penalties.penalty + earningsQuality.adjustment;

  // ── Confluence zone (preserved) ──
  let confluenceZone = false;
  let confluenceNote = '';
  let waveBonus = 0;

  if (week52High != null && week52Low != null && price200WMA != null && currentPrice != null) {
    const range = week52High - week52Low;
    if (range > 0) {
      const fib618Level = week52High - 0.618 * range;
      const wmaFibDiff = Math.abs(price200WMA - fib618Level) / fib618Level;

      if (wmaFibDiff <= 0.05) {
        const confluenceLevel = (price200WMA + fib618Level) / 2;
        if (currentPrice <= confluenceLevel * 1.03) {
          confluenceZone = true;
          waveBonus += 15;
          confluenceNote = `CONFLUENCE ZONE: 200WMA ($${f(price200WMA)}) and 0.618 Fib ($${f(fib618Level)}) converge at the same price level.`;
        }
      }
    }
  }

  // ── Technical bonuses (from Sprint 5) ──
  let bonusNotes = [];

  // 50-day MA Wave 2 confirmation
  if (opts.ma50d != null && opts.waveSignal === 'WAVE_2_BOTTOM') {
    const pctFromMa50 = currentPrice != null && opts.ma50d > 0
      ? Math.abs((currentPrice - opts.ma50d) / opts.ma50d) * 100 : null;
    if (pctFromMa50 != null && pctFromMa50 <= 5) {
      totalScore += 5;
      bonusNotes.push('50-day MA acting as Wave 2 support.');
    }
  }

  // Golden Cross / Death Cross
  if (opts.goldenCross) {
    totalScore += 5;
    bonusNotes.push('Golden Cross detected.');
  }
  if (opts.deathCross) {
    totalScore -= 5;
    bonusNotes.push('Death Cross detected.');
  }

  // HH/HL pattern
  if (opts.hhHlPattern) {
    totalScore += 5;
    bonusNotes.push('Higher highs and higher lows confirmed.');
  }

  // Generational buy (from Sprint 5)
  let generationalBuy = false;
  if (opts.wave1Origin != null && price200MMA != null && currentPrice != null) {
    const fib786 = opts.fib786Level;
    const levels = [fib786, opts.wave1Origin, price200MMA].filter(v => v != null);
    if (levels.length >= 3) {
      const allWithin15 = levels.every(l => Math.abs((l - currentPrice) / currentPrice) <= 0.15);
      if (allWithin15) {
        generationalBuy = true;
        waveBonus += 25;
        bonusNotes.push(`GENERATIONAL BUY — three major support structures converging.`);
      }
    }
  }

  totalScore += waveBonus;

  // Cap at 0-100
  totalScore = Math.max(0, Math.min(100, totalScore));

  // Collect all flags
  const allFlags = [
    ...bonuses.flags,
    ...penalties.flags,
    ...earningsQuality.flags,
    revenue.flag,
    momentum.flag,
    fcf.flag,
    balanceSheet.flag,
  ].filter(Boolean);

  if (generationalBuy) allFlags.push('GENERATIONAL_BUY');
  if (confluenceZone) allFlags.push('CONFLUENCE_ZONE');

  // Fundamental deterioration override
  let fundamentalDeterioration = false;
  if (opts.previousScore != null && opts.previousScore > 60 && revenueGrowthPct != null && revenueGrowthPct < 0) {
    fundamentalDeterioration = true;
    allFlags.push('THESIS_BROKEN');
    bonusNotes.push('THESIS BROKEN — revenue growth turned negative.');
  }

  // Signal determination
  const signal = determineSignal(totalScore, allFlags);

  const { entryZone, entryNote } = getEntryZone({
    currentPrice,
    price200WMA,
    price200MMA,
    pctFrom200WMA,
    pctFrom200MMA,
  });

  // Return to 200WMA calculation
  const returnTo200wmaPct = (price200WMA != null && currentPrice != null && currentPrice > 0 && price200WMA > currentPrice)
    ? safe(((price200WMA - currentPrice) / currentPrice) * 100, 1)
    : null;

  return {
    pctFrom52wHigh: safe(pctFrom52wHigh, 1),
    pctFrom200WMA: safe(pctFrom200WMA, 1),
    pctFrom200MMA: safe(pctFrom200MMA, 1),
    // V1 preserved
    scoreV1,
    fundamentalScoreV1,
    // V2 scoring
    fundamentalScore: fundamentalBase,
    fundamentalBase,
    technicalScore,
    technicalBase: technicalScore,
    totalScore,
    bonusPoints: bonuses.bonus,
    penaltyPoints: penalties.penalty,
    earningsQualityAdj: earningsQuality.adjustment,
    waveBonus,
    // Signal
    signal,
    entryZone,
    entryNote,
    confluenceZone,
    confluenceNote,
    generationalBuy,
    fundamentalDeterioration,
    returnTo200wmaPct,
    // Flags + notes
    flags: allFlags,
    bonusNotes,
    // Breakdown for API response
    scoreBreakdown: {
      revenue: revenue,
      momentum: momentum,
      fcf: fcf,
      moat: moat,
      valuation: valuation,
      balanceSheet: balanceSheet,
    },
  };
}

function safe(val, dec = 1) {
  if (val == null || !isFinite(val)) return null;
  return Math.round(val * Math.pow(10, dec)) / Math.pow(10, dec);
}

module.exports = {
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
};
