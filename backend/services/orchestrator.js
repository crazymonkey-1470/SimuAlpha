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

/**
 * Run a full agentic analysis for a single ticker.
 * Executes skills in dependency order, stores the result.
 */
async function analyzeStock(ticker) {
  console.log(`[Orchestrator] Starting full analysis for ${ticker}...`);
  const startTime = Date.now();

  // Step 1: Gather existing data from screener_results
  const { data: stockData } = await supabase
    .from('screener_results')
    .select('*')
    .eq('ticker', ticker)
    .single();

  if (!stockData) {
    throw new Error(`${ticker} not found in screener_results. Run pipeline first.`);
  }

  // Step 2: Gather supplementary data
  const { fetchHistoricalPrices } = require('./fetcher');
  const [{ data: valData }, { data: instData }, { data: waveData }, historicals] = await Promise.all([
    supabase.from('stock_valuations').select('*').eq('ticker', ticker).order('computed_date', { ascending: false }).limit(1),
    supabase.from('consensus_signals').select('*').eq('ticker', ticker).order('quarter', { ascending: false }).limit(1),
    supabase.from('wave_counts').select('*').eq('ticker', ticker).order('last_updated', { ascending: false }).limit(1),
    fetchHistoricalPrices(ticker).catch(() => ({ weeklyCloses: [], monthlyCloses: [], weeklyVolumes: [] })),
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
      companyDescription: stockData.company_name || ticker,
      sector: stockData.sector || 'Unknown',
      grossMargin: stockData.gross_margin_current || 0,
      marketCap: stockData.market_cap ? stockData.market_cap / 1e9 : 0,
      revenueModel: 'Unknown',
    }),
    invoke('assess_earnings', {
      ticker,
      epsHistory: stockData.eps_gaap ? [stockData.eps_gaap] : (stockData.eps_diluted ? [stockData.eps_diluted] : [0]),
      fcfHistory: stockData.free_cash_flow ? [stockData.free_cash_flow / 1e6] : [0],
      revenueHistory: stockData.revenue_current ? [stockData.revenue_prior_year || 0, stockData.revenue_current].filter(Boolean).map(v => v / 1e6) : [0],
      operatingIncome: (stockData.operating_income || 0) / 1e6,
      netIncome: (stockData.net_income || 0) / 1e6,
    }),
    invoke('detect_value_trap', {
      ticker,
      revenueHistory: stockData.revenue_history || [],
      fcfHistory: [],
      marginHistory: [],
      debtToEquity: stockData.debt_to_equity || 0,
      payoutRatio: 0,
      pe: stockData.pe_ratio || 0,
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

  // Phase 2: Wave interpretation (uses price data)
  try {
    results.wave = await invoke('interpret_wave', {
      ticker,
      weeklyPrices: historicals.weeklyRaw || [],
      monthlyPrices: historicals.monthlyRaw || [],
      sma50: stockData.ma_50d || 0,
      sma200: stockData.price_200mma || 0,
      wma200: stockData.price_200wma || 0,
    });
  } catch (err) {
    console.error(`[Orchestrator] Wave interpretation failed:`, err.message);
    results.wave = wave?.wave_count_json || null;
  }

  // Phase 3: Position sizing (depends on wave)
  try {
    results.positionSizing = await invoke('position_sizing', {
      ticker,
      currentPrice: stockData.current_price || 0,
      wavePosition: results.wave?.current_wave || 'Unknown',
      confluenceZone: stockData.confluence_zone || false,
      totalScore: stockData.total_score || 0,
    });
  } catch (err) {
    console.error(`[Orchestrator] Position sizing failed:`, err.message);
    results.positionSizing = null;
  }

  // Phase 4: Three-pillar valuation
  try {
    results.valuation = await invoke('three_pillar_value', {
      ticker,
      currentPrice: stockData.current_price || 0,
      revenue: stockData.revenue_current || 0,
      revenueGrowth: stockData.revenue_growth_pct || 0,
      fcf: stockData.free_cash_flow || 0,
      ebitda: stockData.ttm_ebitda || 0,
      sector: stockData.sector || 'Unknown',
      sharesOutstanding: stockData.shares_outstanding || stockData.diluted_shares || 0,
      totalDebt: stockData.total_debt || 0,
      cash: stockData.cash_and_equivalents || 0,
      beta: stockData.beta || 1.0,
    });
  } catch (err) {
    console.error(`[Orchestrator] Valuation failed:`, err.message);
    results.valuation = valuation || null;
  }

  // Phase 5: Thesis synthesis (depends on all above)
  try {
    results.thesis = await invoke('write_thesis', {
      ticker,
      scoring: {
        fundamental_score: stockData.fundamental_score,
        technical_score: stockData.technical_score,
        total_score: stockData.total_score,
        signal: stockData.signal,
        moat_tier: stockData.moat_tier,
        flags: stockData.flags,
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
    console.error(`[Orchestrator] Thesis generation failed:`, err.message);
    results.thesis = null;
  }

  // Phase 6: Compare to greats
  try {
    results.greats = await invoke('compare_to_greats', {
      ticker,
      profile: {
        company_name: stockData.company_name,
        sector: stockData.sector,
        market_cap: stockData.market_cap,
        pe_ratio: stockData.pe_ratio,
        revenue_growth_pct: stockData.revenue_growth_pct,
      },
      scoring: {
        total_score: stockData.total_score,
        signal: stockData.signal,
      },
      valuation: results.valuation,
      moat: results.moat,
    });
  } catch (err) {
    console.error(`[Orchestrator] Compare to greats failed:`, err.message);
    results.greats = null;
  }

  // ═══════════════════════════════════════════
  // Phase 7: Sprint 10B — Classification & Risk (Sprint 10B)
  // ═══════════════════════════════════════════

  // Fundamental Gate — runs before every entry/add/reentry decision
  const gate = fundamentalGate({
    revenueGrowthYoY: stockData.revenue_growth_pct,
    revenueGrowthPriorYoY: stockData.revenue_growth_prior_year,
    grossMarginCurrent: stockData.gross_margin_current,
    grossMarginPriorYear: stockData.gross_margin_prior_year,
    ttmEBITDA: stockData.ttm_ebitda,
    totalDebt: stockData.total_debt,
    epsGrowthQoQ: stockData.eps_growth_qoq,
    epsGrowthPriorQoQ: stockData.eps_growth_prior_qoq,
    sharesOutstandingChange: stockData.shares_outstanding_change,
    insiderNetBuying: stockData.insider_net_buying,
  });

  // Lynch Classification
  const lynchClass = classifyLynch({
    epsGrowthYoY: stockData.eps_growth_yoy || 0,
    epsGrowth5Yr: stockData.eps_growth_5yr || 0,
    netIncome: stockData.net_income || 0,
    netIncomePriorYear: stockData.net_income_prior_year || 0,
    revenueGrowthYoY: stockData.revenue_growth_pct || 0,
    sector: stockData.sector,
  });

  // PEG Ratio
  const epsGrowth = stockData.eps_growth_yoy || stockData.eps_growth_5yr || 0;
  const peg = (stockData.pe_ratio && epsGrowth > 0)
    ? Math.round((stockData.pe_ratio / epsGrowth) * 100) / 100
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
    patentCliffWithin3Years: stockData.patent_cliff || false,
    regulatoryActionPending: stockData.regulatory_action || false,
    tariffExposure: stockData.tariff_exposure || 0,
    debtToEquity: stockData.debt_to_equity || 0,
    fcfMargin: stockData.fcf_margin || 0,
    recentDataBreach: stockData.data_breach || false,
    keyPersonRisk: stockData.key_person_risk || false,
    accountingAllegations: stockData.accounting_allegations || false,
    gaapNonGaapDivergence: stockData.gaap_nongaap_divergence || 0,
  });

  // Multiple Compression
  const compression = detectMultipleCompression({
    evSales5YrAvg: stockData.ev_sales_5yr_avg || null,
    currentEVSales: stockData.current_ev_sales || null,
    revenueGrowthYoY: stockData.revenue_growth_pct || 0,
  });

  // Margin of Safety
  const avgTarget = results.valuation?.valuation?.avgTarget || stockData.avg_price_target;
  const currentPrice = stockData.current_price;
  const mos = computeMarginOfSafety(avgTarget, currentPrice);

  // Rating Engine
  const moatScore = results.moat?.moat_tier_numeric || results.moat?.score || 0;
  const compositeForRating = {
    compositeUpside: results.valuation?.valuation?.avgUpside || stockData.avg_upside_pct || 0,
    totalReturn: results.valuation?.valuation?.totalReturn || (stockData.avg_upside_pct || 0) + (stockData.dividend_yield || 0),
  };
  const ratingResult = assignRating(
    {
      revenueGrowthYoY: stockData.revenue_growth_pct || 0,
      ebitdaGrowthYoY: stockData.ebitda_growth_yoy || 0,
      debtToEbitda: (stockData.total_debt && stockData.ttm_ebitda && stockData.ttm_ebitda > 0)
        ? stockData.total_debt / stockData.ttm_ebitda : 0,
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

  // Tranche recommendation
  const tranche = recommendTranche(stockData, wave);

  // ═══════════════════════════════════════════
  // Sprint 10C — Run the v3 scorer live
  // ═══════════════════════════════════════════
  // Normalize the SAIN consensus shape that computeTLIScoreV3 expects
  const sainForScorer = results.consensus ? {
    is_full_stack_consensus: results.consensus?.is_full_stack || results.consensus?.is_full_stack_consensus || false,
    layers_aligned: results.consensus?.layers_aligned || 0,
  } : null;

  let v3Result = null;
  try {
    v3Result = computeTLIScoreV3(
      stockData,
      results.wave || wave?.wave_count_json || null,
      results.macro || null,
      results.consensus || institutional || null,
      sainForScorer,
    );
  } catch (err) {
    console.error(`[Orchestrator] v3 scorer failed for ${ticker}:`, err.message);
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
    positionAction: stockData.position_action || tranche.type,
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
      lynch: { score: stockData.lynch_score ?? null, max: 7, pass: (stockData.lynch_score ?? 0) >= 5, badge: stockData.badges?.includes('LYNCH_PERFECT_SCORE') ? 'LYNCH_PERFECT_SCORE' : null },
      buffett: { score: stockData.buffett_score ?? null, max: 9, pass: (stockData.buffett_score ?? 0) >= 6 },
      dualScreenPass: stockData.dual_screen_pass || false,
      healthRedFlags: stockData.health_red_flags ?? null,
      healthDetails: stockData.score_breakdown?.health?.redFlags || [],
    },

    valuation: {
      dcf: results.valuation?.valuation?.dcf || { target: stockData.dcf_price_target, upside: null, wacc: null, terminal: null },
      evSales: results.valuation?.valuation?.evSales || { target: stockData.ev_sales_price_target, upside: null },
      evEbitda: results.valuation?.valuation?.evEbitda || { target: stockData.ev_ebitda_price_target, upside: null },
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
      supportConfirmed: stockData.support_confirmed || null,
      chaseFilter: null,
      earningsBlackout: null,
      sentiment: null,
      allPass: stockData.risk_filters_pass ?? null,
      overrideReason: stockData.risk_filter_reason || null,
    },

    gateResult: {
      passes: gate.passes,
      disqualified: gate.disqualified,
      failures: gate.failures,
    },

    nextFundamentalReview: stockData.next_earnings_date || null,
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
    console.error(`[Orchestrator] recordSignal failed for ${ticker}:`, err.message);
  }

  // Step 4: Store the complete analysis
  const elapsed = Date.now() - startTime;
  const analysis = {
    ticker,
    signal: scoreResult.signal,
    composite_score: scoreResult.totalScore ?? results.thesis?.composite_score ?? stockData.total_score,
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

  const { error } = await supabase
    .from('stock_analysis')
    .upsert(analysis, { onConflict: 'ticker' });

  if (error) {
    console.error(`[Orchestrator] Storage error:`, error.message);
  }

  console.log(`[Orchestrator] ${ticker} analysis complete in ${(elapsed / 1000).toFixed(1)}s — Rating: ${ratingResult.rating}, Lynch: ${lynchClass.category}`);
  return analysis;
}

/**
 * Run a learning cycle: extract principles from outcomes,
 * propose weight adjustments for human review.
 */
async function runLearningCycle() {
  console.log('[Orchestrator] Starting learning cycle...');

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
    console.error('[Orchestrator] Principle extraction failed:', err.message);
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
    console.error('[Orchestrator] Weight adjustment failed:', err.message);
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

  console.log('[Orchestrator] Learning cycle complete.');
  return {
    principles_extracted: principles?.principles?.length || 0,
    adjustments_proposed: adjustments?.proposed_changes?.length || 0,
    patterns_noticed: principles?.patterns_noticed || [],
  };
}

module.exports = { analyzeStock, runLearningCycle };
