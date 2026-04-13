/**
 * Skill: Adjust Scoring Weights
 *
 * Analyzes signal outcomes (predictions vs reality) and proposes weight
 * adjustments to improve the TLI scoring algorithm. Enforces safety guardrails
 * to prevent destabilizing core rules.
 *
 * execute({ signalOutcomes, currentWeights, knowledgeContext })
 * -> { adjustments, no_change, overall_assessment, version }
 */

const log = require('../../services/logger').child({ module: 'adjust_weights' });
const { completeJSON } = require('../../services/llm');

const SAFETY_RULES = {
  // Immutable TLI core methodology — NEVER adjust these
  CORE_RULES: [
    // Elliott Wave hard rules
    'elliott_wave_hard_rule_w2_not_below_w1',
    'elliott_wave_hard_rule_w3_not_shortest',
    'elliott_wave_hard_rule_w4_not_in_w2',
    // Fibonacci target formulas
    'fib_retracement_0618',
    'fib_retracement_0500',
    'fib_retracement_0382',
    'fib_extension_1618',
    'fib_extension_2618',
    // 5-tranche DCA structure
    'tranche_schedule_10_15_20_25_30',
    // Fundamental gate pass/fail criteria
    'fundamental_gate_revenue_growth',
    'fundamental_gate_gross_margin',
    'fundamental_gate_operating_leverage',
    'fundamental_gate_dilution',
    // Language rule
    'never_say_buy_sell',
    // Risk formula
    'per_trade_risk_max_2pct',
    // Legacy v2 immutable rules (retained for backward compatibility)
    'revenue_growth_3yr',
    'growth_momentum',
    'fcf_profitability',
    'moat_strength',
    'valuation_vs_peers',
    'balance_sheet',
    'technical_200wma',
    'technical_200mma',
  ],
  // Maximum points adjustment per factor per iteration
  MAX_ADJUSTMENT_PER_FACTOR: 3,
  // Adjustable v3 scoring_config keys (mirrors scoring_config table)
  ADJUSTABLE_CATEGORIES: [
    // Fundamental component weights
    'fundamental_revenue_growth',
    'fundamental_gross_margin',
    'fundamental_fcf',
    'fundamental_balance_sheet',
    'fundamental_tam',
    'fundamental_moat',
    // Confluence support stack weights
    'confluence_previous_low',
    'confluence_round_number',
    'confluence_50ma',
    'confluence_200ma',
    'confluence_200wma',
    'confluence_fib_0382',
    'confluence_fib_050',
    'confluence_fib_0618',
    'confluence_fib_0786',
    'confluence_wave1_origin',
    'confluence_zone_bonus',
    'generational_buy_bonus',
    // SAIN bonuses
    'sain_full_stack',
    'sain_three_layer',
    'sain_politician_conviction',
    'sain_ai_consensus',
    // Risk filter parameters
    'downtrend_threshold',
    'chase_filter_pct',
    'earnings_blackout_days',
    'sentiment_boost',
    // Legacy v2 bonus/penalty weights (retained)
    'bonus_dividend',
    'bonus_institutional_new_buy',
    'bonus_institutional_multi_investor',
    'bonus_institutional_dca',
    'bonus_call_options',
    'bonus_high_quality_saas',
    'bonus_buyback',
    'bonus_cyclical_recovery',
    'penalty_value_trap',
    'penalty_gaap_divergence',
    'penalty_investor_dumping',
    'penalty_sustained_exit',
    'penalty_rapid_abandonment',
    'penalty_late_cycle',
    'penalty_earnings_proximity',
    'penalty_ai_capex',
    'penalty_capex_credibility',
    'penalty_debt_carry',
    'wave_confluence_bonus',
    'wave_generational_buy',
    'wave_golden_cross',
    'wave_death_cross',
    'wave_hh_hl_pattern',
    'valuation_strong_undervaluation',
    'valuation_moderate_undervaluation',
    'valuation_overvaluation_warning',
    'valuation_significantly_overvalued',
    'valuation_wacc_elevated',
    'valuation_wacc_high',
  ],
};

const SYSTEM_PROMPT = `You adjust SimuAlpha's scoring weights based on backtested signal outcomes.

═══════════════════════════════════════════════════════
CURRENT SCORING STRUCTURE (v3)
═══════════════════════════════════════════════════════
- Fundamental (0-30): 6 components at 5pts each
- Wave Position (-15 to +30): based on Elliott Wave cycle position
- Confluence (0-40): 10-item support stack + special bonuses
- SAIN Bonus: up to +15 for Full Stack Consensus

═══════════════════════════════════════════════════════
ADJUSTABLE WEIGHTS (you can propose changes to these)
═══════════════════════════════════════════════════════
- Each fundamental component's point value (currently 5 each)
- Confluence support stack point values (currently 2-5 each)
- SAIN bonus values (currently +2 to +15)
- Downtrend suppression threshold (currently 4/8)
- Risk filter parameters (chase filter %, earnings blackout days)

Full adjustable list: ${SAFETY_RULES.ADJUSTABLE_CATEGORIES.join(', ')}

═══════════════════════════════════════════════════════
NON-ADJUSTABLE (core TLI methodology — NEVER change)
═══════════════════════════════════════════════════════
- Elliott Wave hard rules (W2 never below W1, W3 never shortest, W4 not in W2)
- Fibonacci target formulas (0.618, 1.618, 0.382, etc)
- 5-tranche DCA structure (10/15/20/25/30)
- Fundamental gate pass/fail criteria
- "Never say buy/sell" language rule
- Position sizing risk formula (1-2% max risk per trade)

Core rule list: ${SAFETY_RULES.CORE_RULES.join(', ')}

═══════════════════════════════════════════════════════
ANALYSIS PROCESS
═══════════════════════════════════════════════════════
1. For each scoring factor, compute win rate across all backtested signals
2. Win = stock achieved >10% return within 12 months of signal
3. If a factor's win rate > 70% → propose increasing its weight (+1 to +3)
4. If a factor's win rate < 40% → propose decreasing its weight (-1 to -3)
5. If sample size < 10 → insufficient data, do not adjust
6. Check if proposed change conflicts with any NON-ADJUSTABLE rule — if yes, skip
7. Maximum adjustment is +/- 3 points per factor per iteration (small, incremental)
8. Write reasoning memo for each adjustment — cite hit rate, sample size, evidence
9. Prefer fewer, higher-confidence adjustments over many speculative ones

═══════════════════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════════════════
Respond with JSON:
{
  "adjustments": [
    {
      "factor": "factor_name (must be in ADJUSTABLE list)",
      "current_weight": number,
      "proposed_weight": number,
      "change": number (+/- 3 max),
      "reasoning": "Based on X outcomes, this factor had Y% hit rate over Z-month horizon...",
      "confidence": "LOW|MODERATE|HIGH",
      "sample_size": number,
      "win_rate": number (0-100)
    }
  ],
  "no_change": ["factor1", "factor2"],
  "overall_assessment": "Summary of algorithm performance and proposed changes",
  "version": "suggested version string",
  "model_performance": {
    "total_signals_analyzed": number,
    "overall_hit_rate": number,
    "avg_return_on_wins": number,
    "avg_return_on_losses": number
  }
}`;

async function execute({ signalOutcomes, currentWeights, knowledgeContext }) {
  if (!signalOutcomes || !Array.isArray(signalOutcomes) || signalOutcomes.length === 0) {
    return {
      adjustments: [],
      no_change: SAFETY_RULES.ADJUSTABLE_CATEGORIES,
      overall_assessment: 'No signal outcomes provided. Cannot evaluate algorithm performance without outcome data.',
      version: null,
    };
  }

  if (!currentWeights || typeof currentWeights !== 'object') {
    throw new Error('[adjust_weights] currentWeights object is required');
  }

  // Compute outcome statistics for the prompt
  const stats = computeOutcomeStats(signalOutcomes);

  // Build the user prompt
  const sections = [];

  sections.push(`SIGNAL OUTCOMES (${signalOutcomes.length} total):`);
  sections.push(`  Correct predictions: ${stats.correct} (${stats.hitRate}%)`);
  sections.push(`  Incorrect predictions: ${stats.incorrect} (${stats.missRate}%)`);
  sections.push(`  Avg return on BUY signals: ${stats.avgReturnOnBuys != null ? stats.avgReturnOnBuys + '%' : 'N/A'}`);
  sections.push(`  Avg return on PASS signals: ${stats.avgReturnOnPasses != null ? stats.avgReturnOnPasses + '%' : 'N/A'}`);

  if (stats.factorBreakdown.length > 0) {
    sections.push(`\nFACTOR PERFORMANCE:`);
    for (const fb of stats.factorBreakdown) {
      sections.push(`  ${fb.factor}: present in ${fb.count} signals, ${fb.hitRate}% hit rate, avg return ${fb.avgReturn}%`);
    }
  }

  sections.push(`\nCURRENT WEIGHTS:`);
  for (const [key, val] of Object.entries(currentWeights)) {
    sections.push(`  ${key}: ${val}`);
  }

  if (knowledgeContext) {
    sections.push(`\nKNOWLEDGE CONTEXT:`);
    if (typeof knowledgeContext === 'string') {
      sections.push(`  ${knowledgeContext}`);
    } else if (Array.isArray(knowledgeContext)) {
      for (const chunk of knowledgeContext) {
        sections.push(`  - ${typeof chunk === 'string' ? chunk : chunk.content || JSON.stringify(chunk)}`);
      }
    }
  }

  sections.push(`\nSAMPLE OUTCOMES (most recent ${Math.min(20, signalOutcomes.length)}):`);
  const recentOutcomes = signalOutcomes.slice(0, 20);
  for (const outcome of recentOutcomes) {
    sections.push(`  ${outcome.ticker || 'N/A'}: Signal=${outcome.signal || 'N/A'}, Score=${outcome.score ?? 'N/A'}, Actual Return=${outcome.actual_return != null ? outcome.actual_return + '%' : 'N/A'}, Flags=[${(outcome.flags || []).join(', ')}]`);
  }

  const userPrompt = sections.join('\n');

  let result;
  try {
    result = await completeJSON({
      task: 'WEIGHT_ADJUST',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 2000,
    });
  } catch (err) {
    log.error({ err }, 'LLM analysis failed');
    return {
      adjustments: [],
      no_change: SAFETY_RULES.ADJUSTABLE_CATEGORIES,
      overall_assessment: `Weight adjustment analysis failed: ${err.message}. No changes recommended.`,
      version: null,
    };
  }

  if (!result) {
    return {
      adjustments: [],
      no_change: SAFETY_RULES.ADJUSTABLE_CATEGORIES,
      overall_assessment: 'LLM returned unparseable response. No changes recommended.',
      version: null,
    };
  }

  // Enforce safety guardrails on the LLM's proposed adjustments
  const safeAdjustments = [];
  const violations = [];

  if (Array.isArray(result.adjustments)) {
    for (const adj of result.adjustments) {
      if (!adj || !adj.factor) continue;

      // Rule 1: Cannot remove core rules
      if (SAFETY_RULES.CORE_RULES.includes(adj.factor)) {
        violations.push(`Blocked: attempted to modify core rule "${adj.factor}"`);
        continue;
      }

      // Rule 2: Only adjustable categories
      if (!SAFETY_RULES.ADJUSTABLE_CATEGORIES.includes(adj.factor)) {
        violations.push(`Blocked: "${adj.factor}" is not in the adjustable categories list`);
        continue;
      }

      // Rule 3: Max +/- 3 points
      const change = Number(adj.change);
      if (!isFinite(change)) {
        violations.push(`Blocked: "${adj.factor}" has invalid change value`);
        continue;
      }
      const clampedChange = Math.max(
        -SAFETY_RULES.MAX_ADJUSTMENT_PER_FACTOR,
        Math.min(SAFETY_RULES.MAX_ADJUSTMENT_PER_FACTOR, change)
      );

      if (clampedChange === 0) continue;

      safeAdjustments.push({
        factor: adj.factor,
        current_weight: Number(adj.current_weight) || currentWeights[adj.factor] || 0,
        proposed_weight: (Number(adj.current_weight) || currentWeights[adj.factor] || 0) + clampedChange,
        change: clampedChange,
        reasoning: adj.reasoning || 'No reasoning provided',
        confidence: ['LOW', 'MODERATE', 'HIGH'].includes(adj.confidence) ? adj.confidence : 'LOW',
        clamped: clampedChange !== change,
      });
    }
  }

  if (violations.length > 0) {
    log.warn({ violations }, 'Safety violations blocked');
  }

  // Determine which factors had no change
  const adjustedFactors = new Set(safeAdjustments.map(a => a.factor));
  const noChange = Array.isArray(result.no_change)
    ? result.no_change.filter(f => typeof f === 'string')
    : SAFETY_RULES.ADJUSTABLE_CATEGORIES.filter(f => !adjustedFactors.has(f));

  // Build version string
  const version = result.version || `v2.${Date.now()}`;

  return {
    adjustments: safeAdjustments,
    no_change: noChange,
    overall_assessment: (result.overall_assessment || 'Analysis complete.') +
      (violations.length > 0 ? ` [${violations.length} proposed changes blocked by safety rules.]` : ''),
    version,
  };
}

/**
 * Compute summary statistics from signal outcomes.
 */
function computeOutcomeStats(outcomes) {
  let correct = 0;
  let incorrect = 0;
  const buyReturns = [];
  const passReturns = [];
  const factorMap = {};

  for (const o of outcomes) {
    const ret = o.actual_return;
    const signal = o.signal;

    // A "correct" prediction: BUY-type signals with positive return, PASS with flat/negative
    const isBuySignal = ['LOAD THE BOAT', 'ACCUMULATE', 'GENERATIONAL_BUY'].includes(signal);
    const isPassSignal = ['PASS', 'VALUE_TRAP', 'FUNDAMENTAL_DETERIORATION'].includes(signal);

    if (ret != null && isFinite(ret)) {
      if (isBuySignal) {
        buyReturns.push(ret);
        if (ret > 0) correct++;
        else incorrect++;
      } else if (isPassSignal) {
        passReturns.push(ret);
        if (ret <= 5) correct++; // PASS was correct if stock didn't rally >5%
        else incorrect++;
      }
    }

    // Track factor presence and outcomes
    if (Array.isArray(o.flags)) {
      for (const flag of o.flags) {
        if (!factorMap[flag]) factorMap[flag] = { count: 0, returns: [] };
        factorMap[flag].count++;
        if (ret != null && isFinite(ret)) factorMap[flag].returns.push(ret);
      }
    }
  }

  const total = correct + incorrect;
  const avgBuy = buyReturns.length > 0
    ? Math.round(buyReturns.reduce((a, b) => a + b, 0) / buyReturns.length * 10) / 10
    : null;
  const avgPass = passReturns.length > 0
    ? Math.round(passReturns.reduce((a, b) => a + b, 0) / passReturns.length * 10) / 10
    : null;

  const factorBreakdown = Object.entries(factorMap)
    .filter(([, v]) => v.count >= 3) // Only include factors with enough data
    .map(([factor, v]) => {
      const posReturns = v.returns.filter(r => r > 0).length;
      const hitRate = v.returns.length > 0 ? Math.round(posReturns / v.returns.length * 100) : 0;
      const avgReturn = v.returns.length > 0
        ? Math.round(v.returns.reduce((a, b) => a + b, 0) / v.returns.length * 10) / 10
        : 0;
      return { factor, count: v.count, hitRate, avgReturn };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return {
    correct,
    incorrect,
    hitRate: total > 0 ? Math.round(correct / total * 100) : 0,
    missRate: total > 0 ? Math.round(incorrect / total * 100) : 0,
    avgReturnOnBuys: avgBuy,
    avgReturnOnPasses: avgPass,
    factorBreakdown,
  };
}

module.exports = { execute };
