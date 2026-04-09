/**
 * Orchestrator Service — Sprint 8
 *
 * The brain of the agentic system. Coordinates skill execution
 * for full stock analysis and learning cycles.
 */

const { invoke, listSkills } = require('../skills');
const supabase = require('./supabase');
const { retrieve, getStats } = require('./knowledge');

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
      companyDescription: stockData.company_name || ticker,
      sector: stockData.sector || 'Unknown',
      grossMargin: stockData.gross_margin_current || 0,
      marketCap: stockData.market_cap ? stockData.market_cap / 1e9 : 0,
      revenueModel: 'Unknown',
    }),
    invoke('assess_earnings', {
      ticker,
      epsHistory: stockData.eps_diluted ? [stockData.eps_diluted] : [0],
      fcfHistory: stockData.free_cash_flow ? [stockData.free_cash_flow / 1e6] : [0],
      revenueHistory: stockData.revenue_current ? [stockData.revenue_prior_year || 0, stockData.revenue_current].filter(Boolean) : [0],
      operatingIncome: stockData.operating_income || 0,
      netIncome: stockData.net_income || 0,
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
      weeklyPrices: [],
      monthlyPrices: [],
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

  // Step 4: Store the complete analysis
  const elapsed = Date.now() - startTime;
  const analysis = {
    ticker,
    signal: results.thesis?.signal || stockData.signal,
    composite_score: results.thesis?.composite_score || stockData.total_score,
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

  console.log(`[Orchestrator] ${ticker} analysis complete in ${(elapsed / 1000).toFixed(1)}s`);
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
