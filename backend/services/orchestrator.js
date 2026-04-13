/**
 * Orchestrator Service — Sprint 8 + Sprint 10B Position Action Card
 *
 * The brain of the agentic system. Coordinates skill execution
 * for full stock analysis and learning cycles.
 *
 * Sprint 10B: Integrates Lynch classification, PEG ratio, margin of safety,
 * kill thesis flags, multiple compression, rating engine, and 5-tranche DCA.
 * Outputs full Position Action Card format per spec.
 */

const { invoke, listSkills } = require('../skills');
const supabase = require('./supabase');
const { retrieve, getStats } = require('./knowledge');
const log = require('./logger').child({ module: 'orchestrator' });

// Sprint 10B imports
const { classifyLynch, detectMigration } = require('./lynch_classifier');
const { assignRating } = require('./rating_engine');
const { computeMarginOfSafety } = require('./margin_of_safety');
const { classifyMaturity } = require('./maturity_classifier');
const { recommendTranche } = require('./tranche_sizing');
const { checkKillThesis } = require('../pipeline/kill_thesis');
const { detectMultipleCompression } = require('../pipeline/multiple_compression');
const { fundamentalGate } = require('../pipeline/fundamental_gate');

// Sprint 10C imports
const { computeTLIScoreV3 } = require('./scorer_v3');
const { recordSignal } = require('./signalTracker');
const { logActivity } = require('./agent_logger');

// Sprint 11 — Robust stock data assembly
const { getStockData } = require('./stock_data');

/**
 * Run a full agentic analysis for a single ticker.
 * Executes skills in dependency order, stores the result.
 */
async function analyzeStock(ticker) {
  log.info({ ticker }, 'Starting full analysis');
  const startTime = Date.now();
  logActivity({ type: 'ANALYSIS', title: `Starting analysis: ${ticker}`, description: `Running full skill chain for ${ticker}`, ticker });

  // Step 1: Assemble complete stock data from screener_results + fetcher
  const stockData = await getStockData(ticker);

  // Step 2: Gather supplementary data
  const [{ data: valData }, { data: instData }, { data: waveData }] = await Promise.all([
    supabase.from('stock_valuations').select('*').eq('ticker', ticker).order('computed_date', { ascending: false }).limit(1),
    supabase.from('consensus_signals').select('*').eq('ticker', ticker).order('quarter', { ascending: false }).limit(1),
    supabase.from('wave_counts').select('*').eq('ticker', ticker).order('last_updated', { ascending: false }).limit(1),
  ]);

  const valuation = valData?.[0] || null;
  const institutional = instData?.[0] || null;
  const wave = waveData?.[0] || null;

  // Step 3: Run skills in dependency order
  const results = {};

  // Phase 1: Independent skills (can run in parallel)
  const [moatResult, earningsResult, valueTrapResult, macroResult, consensusResult] = await Promise.allSettled([
    invoke('classify_moat', {
      ticker,
      companyDescription: stockData.companyName || ticker,
      sector: stockData.sector || 'Unknown',
      grossMargin: stockData.grossMarginCurrent || 0,
      marketCap: stockData.marketCap ? stockData.marketCap / 1e9 : 0,
      revenueModel: 'Unknown',
    }),
    invoke('assess_earnings', {
      ticker,
      epsHistory: stockData.epsDiluted ? [stockData.epsDiluted] : [0],
      fcfHistory: stockData.freeCashFlow
        ? [stockData.dilutedShares ? Math.round(stockData.freeCashFlow / stockData.dilutedShares * 100) / 100 : stockData.freeCashFlow / 1e6]
        : [0],
      revenueHistory: stockData.revenueCurrent ? [stockData.revenuePriorYear || 0, stockData.revenueCurrent].filter(Boolean).map(v => v / 1e6) : [0],
      operatingIncome: (stockData.operatingIncome || 0) / 1e6,
      netIncome: (stockData.netIncome || 0) / 1e6,
    }),
    invoke('detect_value_trap', {
      ticker,
      revenueHistory: [],
      fcfHistory: [],
      marginHistory: [],
      debtToEquity: stockData.debtToEquity || 0,
      payoutRatio: 0,
      pe: stockData.peRatio || 0,
      sector: stockData.sector || 'Unknown',
    }),
    invoke('assess_macro', {
      ticker,
      sector: stockData.sector || 'Unknown',
    }),
    invoke('detect_consensus', {
      ticker,
    }),
  ]);

  results.moat = moatResult.status === 'fulfilled' ? moatResult.value : null;
  results.earnings = earningsResult.status === 'fulfilled' ? earningsResult.value : null;
  results.valueTrap = valueTrapResult.status === 'fulfilled' ? valueTrapResult.value : null;
  results.macro = macroResult.status === 'fulfilled' ? macroResult.value : null;
  results.consensus = consensusResult.status === 'fulfilled' ? consensusResult.value : null;

  // Phase 2: Wave interpretation (uses price data from getStockData)
  try {
    results.wave = await invoke('interpret_wave', {
      ticker,
      weeklyPrices: stockData.weeklyRaw || [],
      monthlyPrices: stockData.monthlyRaw || [],
      sma50: stockData.sma50 || 0,
      sma200: stockData.mma200 || stockData.sma200 || 0,
      wma200: stockData.wma200 || 0,
    });
  } catch (err) {
    log.error({ err, ticker }, 'Wave interpretation failed');
    results.wave = wave?.wave_count_json || { error: err.message };
  }

  // Phase 3: Position sizing (depends on wave)
  try {
    results.positionSizing = await invoke('position_sizing', {
      ticker,
      currentPrice: stockData.currentPrice || 0,
      wavePosition: results.wave?.current_wave || 'Unknown',
      confluenceZone: stockData.confluenceZone || false,
      totalScore: stockData.totalScore || 0,
    });
  } catch (err) {
    log.error({ err, ticker }, 'Position sizing failed');
    results.positionSizing = null;
  }

  // Phase 4: Three-pillar valuation
  try {
    results.valuation = await invoke('three_pillar_value', {
      ticker,
      currentPrice: stockData.currentPrice || 0,
      revenue: stockData.revenueCurrent || 0,
      revenueGrowth: stockData.revenueGrowthYoY || 0,
      fcf: stockData.freeCashFlow || 0,
      ebitda: stockData.ttmEBITDA || 0,
      sector: stockData.sector || 'Unknown',
      sharesOutstanding: stockData.sharesOutstanding || stockData.dilutedShares || 0,
      totalDebt: stockData.totalDebt || 0,
      cash: stockData.cashAndEquivalents || 0,
      beta: stockData.beta || 1.0,
    });
  } catch (err) {
    log.error({ err, ticker }, 'Valuation failed');
    results.valuation = valuation || null;
  }

  // Phase 5: Thesis synthesis (depends on all above)
  try {
    results.thesis = await invoke('write_thesis', {
      ticker,
      scoring: {
        fundamental_score: stockData.fundamentalScore,
        technical_score: stockData.technicalScore,
        total_score: stockData.totalScore,
        signal: stockData.signal,
        moat_tier: stockData.moatTier,
        flags: stockData.badges,
      },
      waveAnalysis: results.wave,
      valuation: results.valuation,
      moat: results.moat,
      earningsQuality: results.earnings,
      institutional: results.consensus || institutional,
      macro: results.macro,
      valueTrap: results.valueTrap,
    });
  } catch (err) {
    log.error({ err, ticker }, 'Thesis generation failed');
    results.thesis = null;
  }

  // Phase 6: Compare to greats
  try {
    results.greats = await invoke('compare_to_greats', {
      ticker,
      profile: {
        company_name: stockData.companyName,
        sector: stockData.sector,
        market_cap: stockData.marketCap,
        pe_ratio: stockData.peRatio,
        revenue_growth_pct: stockData.revenueGrowthYoY,
      },
      scoring: {
        total_score: stockData.totalScore,
        signal: stockData.signal,
      },
      valuation: results.valuation,
      moat: results.moat,
    });
  } catch (err) {
    log.error({ err, ticker }, 'Compare to greats failed');
    results.greats = null;
  }

  // ═══════════════════════════════════════════
  // Phase 7: Sprint 10B — Classification & Risk (Sprint 10B)
  // ═══════════════════════════════════════════

  // Fundamental Gate — runs before every entry/add/reentry decision
  const gate = fundamentalGate({
    revenueGrowthYoY: stockData.revenueGrowthYoY,
    revenueGrowthPriorYoY: stockData.revenueGrowthPriorYoY,
    grossMarginCurrent: stockData.grossMarginCurrent,
    grossMarginPriorYear: stockData.grossMarginPriorYear,
    ttmEBITDA: stockData.ttmEBITDA,
    totalDebt: stockData.totalDebt,
    epsGrowthQoQ: stockData.epsGrowthQoQ,
    epsGrowthPriorQoQ: stockData.epsGrowthPriorQoQ,
    sharesOutstandingChange: stockData.sharesOutstandingChange,
    insiderNetBuying: stockData.insiderNetBuying,
  });

  // Lynch Classification
  const lynchClass = classifyLynch({
    epsGrowthYoY: stockData.epsGrowthYoY || 0,
    epsGrowth5Yr: stockData.epsGrowth5Yr || 0,
    netIncome: stockData.netIncome || 0,
    netIncomePriorYear: stockData.netIncomePriorYear || 0,
    revenueGrowthYoY: stockData.revenueGrowthYoY || 0,
    sector: stockData.sector,
  });

  // PEG Ratio
  const epsGrowth = stockData.epsGrowthYoY || stockData.epsGrowth5Yr || 0;
  const peg = (stockData.peRatio && epsGrowth > 0)
    ? Math.round((stockData.peRatio / epsGrowth) * 100) / 100
    : null;
  let pegLabel = null;
  if (peg != null) {
    if (peg < 1) pegLabel = 'ATTRACTIVE';
    else if (peg < 1.5) pegLabel = 'FAIR';
    else if (peg < 2) pegLabel = 'ELEVATED';
    else pegLabel = 'EXPENSIVE';
  }

  // Kill Thesis Flags
  const killThesis = checkKillThesis({
    patentCliffWithin3Years: stockData.patentCliff || false,
    regulatoryActionPending: stockData.regulatoryAction || false,
    tariffExposure: stockData.tariffExposure || 0,
    debtToEquity: stockData.debtToEquity || 0,
    fcfMargin: stockData.fcfMargin || 0,
    recentDataBreach: stockData.dataBreach || false,
    keyPersonRisk: stockData.keyPersonRisk || false,
    accountingAllegations: stockData.accountingAllegations || false,
    gaapNonGaapDivergence: stockData.gaapNongaapDivergence || 0,
  });

  // Multiple Compression
  const compression = detectMultipleCompression({
    evSales5YrAvg: stockData.evSales5YrAvg || null,
    currentEVSales: stockData.currentEVSales || null,
    revenueGrowthYoY: stockData.revenueGrowthYoY || 0,
  });

  // Margin of Safety
  const avgTarget = results.valuation?.valuation?.avgTarget || stockData.avgPriceTarget;
  const currentPrice = stockData.currentPrice;
  const mos = computeMarginOfSafety(avgTarget, currentPrice);

  // Rating Engine
  const moatScore = results.moat?.moat_tier_numeric || results.moat?.score || 0;
  const compositeForRating = {
    compositeUpside: results.valuation?.valuation?.avgUpside || stockData.avg_upside_pct || 0,
    totalReturn: results.valuation?.valuation?.totalReturn || (stockData.avgUpsidePct || 0) + (stockData.dividendYield || 0),
  };
  const ratingResult = assignRating(
    {
      revenueGrowthYoY: stockData.revenueGrowthYoY || 0,
      ebitdaGrowthYoY: stockData._raw?.ebitda_growth_yoy || 0,
      debtToEbitda: (stockData.totalDebt && stockData.ttmEBITDA && stockData.ttmEBITDA > 0)
        ? stockData.totalDebt / stockData.ttmEBITDA : 0,
      sector: stockData.sector,
    },
    compositeForRating,
    moatScore,
    lynchClass.category
  );

  // Kill thesis override: 3+ flags forces downgrade
  if (killThesis.forceDowngrade) {
    if (['STRONG_BUY', 'BUY'].includes(ratingResult.rating)) {
      ratingResult.rating = 'NEUTRAL';
      ratingResult.killThesisOverride = true;
    }
  }

  // Tranche recommendation — pass raw screener row for snake_case compatibility
  const tranche = recommendTranche(stockData._raw || stockData, wave);

  // ═══════════════════════════════════════════
  // Sprint 10C — Run the v3 scorer live
  // ═══════════════════════════════════════════
  // Normalize the SAIN consensus shape that computeTLIScoreV3 expects
  const sainForScorer = results.consensus ? {
    is_full_stack_consensus: results.consensus?.is_full_stack || results.consensus?.is_full_stack_consensus || false,
    layers_aligned: results.consensus?.layers_aligned || 0,
  } : null;

  // stockData from getStockData is already camelCase — add scorer-specific aliases
  const cp = stockData.currentPrice;
  const p200wma = stockData.wma200;
  const p200mma = stockData.mma200;
  const w52h = stockData.week52High;
  const w52l = stockData.week52Low;
  const ma50 = stockData.sma50;

  const stockForScorer = {
    ...stockData,
    // Scorer-specific aliases
    price200WMA: p200wma, price200MMA: p200mma,
    ma50d: ma50,
    previousLow: w52l,

    // Technical flags
    deathCrossActive: stockData.deathCross,
    sma50SlopeNegative: ma50 != null && p200wma != null && ma50 < p200wma,
    sma200SlopeNegative: false,

    // Derived pct calculations
    pctFrom52wHigh: w52h != null && cp != null ? ((cp - w52h) / w52h) * 100 : null,
    pctFrom200WMA: p200wma != null && cp != null ? ((cp - p200wma) / p200wma) * 100 : null,
    pctFrom200MMA: p200mma != null && cp != null ? ((cp - p200mma) / p200mma) * 100 : null,
    returnTo200wmaPct: (p200wma != null && cp > 0 && p200wma > cp)
      ? ((p200wma - cp) / cp) * 100 : null,
  };

  let v3Result = null;
  try {
    v3Result = computeTLIScoreV3(
      stockForScorer,
      results.wave || wave?.wave_count_json || null,
      results.macro || null,
      results.consensus || institutional || null,
      sainForScorer,
    );
  } catch (err) {
    log.error({ err, ticker }, 'v3 scorer failed');
  }

  // Score result — prefer v3 when available, fall back to screener data
  const scoreResult = v3Result ? {
    signal: v3Result.signal,
    label: v3Result.label,
    totalScore: v3Result.totalScore,
    positionAction: v3Result.positionAction || tranche.type,
    badges: v3Result.badges || [],
    fundamentalScore: v3Result.fundamentalScore,
    waveScore: v3Result.waveScore,
    confluenceScore: v3Result.confluenceScore,
    sainBonus: v3Result.sainBonus,
    lynchScreen: v3Result.lynchScreen,
    buffettScreen: v3Result.buffettScreen,
    dualScreenPass: v3Result.dualScreenPass,
    healthCheck: v3Result.healthCheck,
    downtrendFilter: v3Result.downtrendFilter,
    riskFilters: v3Result.riskFilters,
    flags: v3Result.flags,
    scoreBreakdown: v3Result.scoreBreakdown,
  } : {
    signal: results.thesis?.signal || stockData.signal,
    positionAction: stockData._raw?.position_action || tranche.type,
    badges: stockData.badges || [],
  };

  // ═══════════════════════════════════════════
  // Build Position Action Card (Sprint 10B)
  // ═══════════════════════════════════════════
  const waveAnalysis = results.wave || wave?.wave_count_json || {};
  const keyLevels = waveAnalysis?.key_levels || {};

  const positionCard = {
    ticker,
    currentPrice,
    compositePriceTarget: avgTarget || null,
    compositeUpside: compositeForRating.compositeUpside,
    rating: ratingResult.rating,

    screens: {
      lynch: { score: stockData._raw?.lynch_score ?? scoreResult.lynchScreen?.score ?? null, max: 7, pass: (stockData._raw?.lynch_score ?? scoreResult.lynchScreen?.score ?? 0) >= 5, badge: stockData.badges?.includes('LYNCH_PERFECT_SCORE') ? 'LYNCH_PERFECT_SCORE' : null },
      buffett: { score: stockData._raw?.buffett_score ?? scoreResult.buffettScreen?.score ?? null, max: 9, pass: (stockData._raw?.buffett_score ?? scoreResult.buffettScreen?.score ?? 0) >= 6 },
      dualScreenPass: stockData._raw?.dual_screen_pass ?? scoreResult.dualScreenPass ?? false,
      healthRedFlags: stockData._raw?.health_red_flags ?? scoreResult.healthCheck?.redFlagCount ?? null,
      healthDetails: stockData._raw?.score_breakdown?.health?.redFlags || scoreResult.healthCheck?.redFlags || [],
    },

    valuation: {
      dcf: results.valuation?.valuation?.dcf || { target: stockData._raw?.dcf_price_target, upside: null, wacc: null, terminal: null },
      evSales: results.valuation?.valuation?.evSales || { target: stockData._raw?.ev_sales_price_target, upside: null },
      evEbitda: results.valuation?.valuation?.evEbitda || { target: stockData._raw?.ev_ebitda_price_target, upside: null },
      methodAgreement: results.valuation?.valuation?.methodAgreement || null,
      dcfIncluded: results.valuation?.valuation?.dcfIncluded ?? true,
      dcfExclusionReason: results.valuation?.valuation?.dcfExclusionReason || null,
    },

    classification: {
      lynchCategory: lynchClass.category,
      pegRatio: peg,
      pegLabel,
      marginOfSafety: mos?.marginOfSafety ?? null,
      mosRecommendation: mos?.recommendation ?? null,
      moatScore: results.moat?.moat_tier || null,
      killThesisFlags: killThesis.flags,
      killThesisForceDowngrade: killThesis.forceDowngrade,
      totalReturn: compositeForRating.totalReturn,
      isIncomePlay: results.valuation?.valuation?.isIncomePlay || false,
      multipleCompression: compression,
      lynchHoldPeriod: lynchClass.holdPeriod,
      lynchExpectedReturn: lynchClass.expectedReturn,
      lynchSellTrigger: lynchClass.sellTrigger,
      lynchAllocation: lynchClass.allocation,
    },

    wavePosition: {
      currentWave: waveAnalysis.current_wave || null,
      entryZone: keyLevels.wave2_entry ? `$${keyLevels.wave2_entry}` : null,
      wave3Target: keyLevels.wave3_target ? `$${keyLevels.wave3_target}` : null,
      wave4ReaddZone: keyLevels.wave4_target ? `$${keyLevels.wave4_target}` : null,
      wave5Target: keyLevels.wave5_target ? `$${keyLevels.wave5_target}` : null,
      invalidation: keyLevels.invalidation ? `$${keyLevels.invalidation}` : null,
    },

    signal: scoreResult.signal,
    action: scoreResult.positionAction,
    positionSize: tranche,
    badges: scoreResult.badges,

    riskFilters: {
      supportConfirmed: stockData._raw?.support_confirmed || null,
      chaseFilter: null,
      earningsBlackout: null,
      sentiment: null,
      allPass: stockData._raw?.risk_filters_pass ?? scoreResult.riskFilters?.allPass ?? null,
      overrideReason: stockData._raw?.risk_filter_reason || null,
    },

    gateResult: {
      passes: gate.passes,
      disqualified: gate.disqualified,
      failures: gate.failures,
    },

    nextFundamentalReview: stockData._raw?.next_earnings_date || null,
    thesis: results.thesis || null,
  };

  // ═══════════════════════════════════════════
  // Sprint 10C — Record actionable signal with full v3 breakdown
  // ═══════════════════════════════════════════
  try {
    await recordSignal(
      {
        ticker,
        currentPrice,
        elliottWavePosition: waveAnalysis?.current_wave || null,
      },
      scoreResult,
      positionCard,
    );
  } catch (err) {
    log.error({ err, ticker }, 'recordSignal failed');
  }

  // Step 4: Store the complete analysis
  const elapsed = Date.now() - startTime;
  const analysis = {
    ticker,
    signal: scoreResult.signal,
    composite_score: scoreResult.totalScore ?? results.thesis?.composite_score ?? stockData.tliScore,
    thesis_text: results.thesis?.one_liner || null,
    thesis_json: results.thesis || null,
    moat_analysis: results.moat || null,
    earnings_quality: results.earnings || null,
    value_trap: results.valueTrap || null,
    wave_analysis: results.wave || null,
    position_sizing: results.positionSizing || null,
    valuation_analysis: results.valuation || null,
    macro_context: results.macro || null,
    institutional_analysis: results.consensus || null,
    greats_comparison: results.greats || null,
    // Sprint 10B: Position Action Card + classification
    position_card: positionCard,
    lynch_classification: lynchClass,
    rating: ratingResult.rating,
    kill_thesis_flags: killThesis.flags,
    margin_of_safety: mos?.marginOfSafety ?? null,
    peg_ratio: peg,
    multiple_compression: compression,
    tranche_recommendation: tranche,
    gate_result: gate,
    skills_used: listSkills(),
    analysis_elapsed_ms: elapsed,
    analyzed_at: new Date().toISOString(),
  };

  log.info({ ticker, score: analysis.composite_score, signal: analysis.signal }, 'Upserting analysis');

  const { error } = await supabase
    .from('stock_analysis')
    .upsert(analysis, { onConflict: 'ticker' });

  if (error) {
    log.error({ err: error, ticker }, 'Storage error');
  }

  log.info({ ticker, elapsedSec: (elapsed / 1000).toFixed(1), score: analysis.composite_score, signal: analysis.signal, rating: ratingResult.rating, lynchCategory: lynchClass.category }, 'Analysis complete');
  logActivity({
    type: 'ANALYSIS',
    title: `${ticker} — ${analysis.signal} (Score: ${analysis.composite_score})`,
    description: `Analysis complete in ${(elapsed / 1000).toFixed(1)}s. Rating: ${ratingResult.rating}`,
    ticker,
    details: { score: analysis.composite_score, signal: analysis.signal, rating: ratingResult.rating },
    importance: analysis.composite_score >= 70 ? 'IMPORTANT' : 'INFO',
  });
  return analysis;
}

/**
 * Run a learning cycle: extract principles from outcomes,
 * propose weight adjustments for human review.
 */
async function runLearningCycle() {
  log.info('Starting learning cycle');

  // Gather signal outcomes
  const { data: outcomes } = await supabase
    .from('signal_outcomes')
    .select('*')
    .not('return_3mo', 'is', null)
    .order('signal_date', { ascending: false })
    .limit(100);

  // Gather exit signals with outcomes
  const { data: exitSignals } = await supabase
    .from('exit_signals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  // Step 1: Extract principles
  let principles = null;
  try {
    principles = await invoke('extract_principles', {
      outcomes: (outcomes || []).map(o => ({
        ticker: o.ticker,
        signal: o.signal_type,
        entry_date: o.signal_date,
        exit_date: null,
        return_pct: o.return_3mo || 0,
        signal_correct: (o.return_3mo || 0) > 0,
      })),
      exitSignals: (exitSignals || []).map(e => ({
        ticker: e.ticker,
        type: e.signal_type,
        detected_at: e.created_at,
        price_at_signal: e.price_at_signal,
        price_current: e.target_price,
      })),
      currentWeights: {},
    });
  } catch (err) {
    log.error({ err }, 'Principle extraction failed');
  }

  // Store extracted principles
  if (principles?.principles?.length > 0) {
    for (const p of principles.principles) {
      await supabase.from('learned_principles').insert({
        principle_text: p.statement,
        evidence_summary: p.evidence_summary,
        confidence: p.confidence,
        applicable_to: p.applicable_to || [],
        created_at: new Date().toISOString(),
      });
    }
  }

  // Step 2: Propose weight adjustments
  let adjustments = null;
  try {
    adjustments = await invoke('adjust_weights', {
      currentWeights: {},
      principles: principles?.principles || [],
      outcomes: (outcomes || []).map(o => ({
        ticker: o.ticker,
        signal: o.signal_type,
        return_pct: o.return_3mo || 0,
        signal_correct: (o.return_3mo || 0) > 0,
      })),
      performanceStats: {
        total_signals: (outcomes || []).length,
        avg_return: outcomes?.length
          ? (outcomes.reduce((s, o) => s + (o.return_3mo || 0), 0) / outcomes.length).toFixed(2)
          : 0,
      },
    });
  } catch (err) {
    log.error({ err }, 'Weight adjustment failed');
  }

  // Store proposed adjustments (pending human approval)
  if (adjustments?.proposed_changes?.length > 0) {
    for (const change of adjustments.proposed_changes) {
      await supabase.from('weight_adjustments').insert({
        weight_name: change.weight_name,
        current_value: change.current_value,
        proposed_value: change.proposed_value,
        delta: change.delta,
        evidence: change.evidence,
        expected_impact: change.expected_impact,
        status: 'pending',
        created_at: new Date().toISOString(),
      });
    }
  }

  log.info('Learning cycle complete');
  return {
    principles_extracted: principles?.principles?.length || 0,
    adjustments_proposed: adjustments?.proposed_changes?.length || 0,
    patterns_noticed: principles?.patterns_noticed || [],
  };
}

module.exports = { analyzeStock, runLearningCycle };
