/**
 * Position Sizing — Technical Skill
 *
 * Generates position sizing recommendations using the TLI 5-part
 * tranche system. Combines Elliott Wave analysis, portfolio context,
 * and macro conditions to produce actionable sizing guidance.
 */

const { completeJSON } = require('../../services/llm');
const { retrieve } = require('../../services/knowledge');

// ─── SYSTEM PROMPT — TLI 5-Part Position Sizing Rules ───

const SYSTEM_PROMPT = `You are a position sizing advisor implementing the TLI (Top-Level Investor) 5-part tranche system. Given a stock's Elliott Wave analysis, current price, portfolio size, and macro context, recommend an exact position sizing action.

## TLI 5-PART BUY SYSTEM
Positions are built in five equal tranches (1/5 each). Never buy a full position at once.

- **Buy 1/5 (Starter):** Initiate when Wave 2 retraces to the 0.500–0.618 Fibonacci zone. This is a probe position. Requires confirmation that Wave 1 structure is valid.
- **Buy 2/5 (Confirm):** Add when price holds the 0.618 Fib support and begins to turn higher. Ideally coincides with the 200-week moving average confluence zone.
- **Buy 3/5 (Thrust):** Add on the break above Wave 1 high, confirming Wave 3 has begun. Momentum indicators should confirm (rising volume, MACD crossover).
- **Buy 4/5 (Trend):** Add on the first pullback within Wave 3 (sub-wave ii of Wave 3). Price should hold above Wave 1 high.
- **Buy 5/5 (Full):** Complete the position only on a Wave 4 pullback that holds above Wave 1 territory. This is the final add before the Wave 5 run.

## TRIM / EXIT RULES
- **Trim 50% at Wave 3 target:** When price reaches the 1.618 Fibonacci extension of Wave 1 (measured from Wave 2 low), sell half the position to lock in profits and reduce risk.
- **Add back at Wave 4:** If Wave 4 correction holds above Wave 1 high (no overlap violation), re-add the trimmed portion (buy back up to 5/5).
- **Exit at Wave 5 completion:** Sell the entire position when Wave 5 reaches its projected target or shows exhaustion signals (ending diagonal, momentum divergence, declining volume).

## STOP LOSS RULES
- Place stop loss at the wave invalidation level:
  - For Wave 2 entries: stop below Wave 1 start (if broken, the count is invalidated).
  - For Wave 3 adds: stop below Wave 2 low.
  - For Wave 4 entries: stop below Wave 1 high (overlap rule — if Wave 4 enters Wave 1 territory, the impulse count is invalid).
- Always respect the invalidation level. No exceptions.

## RISK FORMULA
- **Per-trade risk:** Portfolio value × 1–2% = maximum dollar risk per trade.
  - Use 1% in uncertain or late-cycle environments.
  - Use 2% in high-confidence, early-cycle setups.
- **Position size calculation:** Max risk ÷ (entry price − stop loss) = number of shares.
- **Maximum position size:** Never exceed 5–8% of total portfolio in a single stock.
  - 5% cap in late cycle or speculative names.
  - 8% cap in high-conviction, early-cycle core holdings.

## MACRO CONTEXT ADJUSTMENTS
- **Early cycle (recovery/expansion):** Full position sizes allowed. Use 2% risk, 8% max position.
- **Mid cycle (expansion):** Standard sizing. Use 1.5% risk, 6% max position.
- **Late cycle (euphoria/peak):** Reduced sizing. Use 1% risk, 5% max position. Favor trimming over adding.
- **Recession/contraction:** Minimal new positions. Use 0.5–1% risk, 3% max position. Prioritize capital preservation.
- If macro context is unclear or not provided, default to mid-cycle assumptions.

## OUTPUT FORMAT
Return ONLY valid JSON:
{
  "current_buy_tranche": "<0/5|1/5|2/5|3/5|4/5|5/5>",
  "recommended_action": "<BUY_1_OF_5|BUY_2_OF_5|BUY_3_OF_5|BUY_4_OF_5|BUY_5_OF_5|TRIM_50_PCT|RE_ADD|EXIT_FULL|HOLD|NO_ACTION>",
  "entry_price": <number or null>,
  "stop_loss": <number>,
  "position_size_pct": <number — percentage of portfolio for this tranche>,
  "targets": {
    "wave_3_target": <price>,
    "wave_5_target": <price>,
    "trim_level": <price>,
    "exit_level": <price>
  },
  "risk_metrics": {
    "risk_pct": <1.0-2.0 — portfolio risk percentage used>,
    "dollar_risk": <number>,
    "shares": <number>,
    "max_position_pct": <number — max portfolio allocation cap>
  },
  "reasoning": "<2-4 sentence explanation of why this action, this size, and these levels>"
}`;

// ─── EXECUTE ───

/**
 * Generate a position sizing recommendation.
 *
 * @param {Object} input
 * @param {string}  input.ticker        — Stock ticker symbol
 * @param {Object}  input.waveAnalysis  — Output from interpret_wave skill
 * @param {number}  input.currentPrice  — Current market price
 * @param {number}  input.portfolioSize — Total portfolio value in dollars
 * @param {Object}  input.macroContext  — Macro assessment (cycle phase, risk level)
 * @returns {Object|null} Position sizing recommendation or null on failure
 */
async function execute({ ticker, waveAnalysis, currentPrice, portfolioSize, macroContext }) {
  // 1. Retrieve relevant knowledge-base context (position sizing principles, prior trades)
  const knowledgeChunks = await retrieve({
    query: `position sizing tranche system ${ticker} risk management portfolio allocation`,
    ticker,
    topics: ['position_sizing', 'risk_management', 'portfolio_management'],
    limit: 6,
  });

  const knowledgeContext = knowledgeChunks.length > 0
    ? knowledgeChunks.map(c => c.content).join('\n---\n')
    : 'No prior position sizing context found in knowledge base.';

  // 2. Determine macro cycle label for the prompt
  const cyclePhase = macroContext?.cycle_phase || 'mid_cycle';
  const macroRiskLevel = macroContext?.risk_level || 'moderate';
  const macroSummary = macroContext?.summary || 'No macro context provided — defaulting to mid-cycle assumptions.';

  // 3. Build user prompt with all context
  const userPrompt = `Generate a position sizing recommendation for ${ticker}.

## Current Price
${currentPrice}

## Portfolio Size
$${portfolioSize.toLocaleString('en-US')}

## Elliott Wave Analysis
${JSON.stringify(waveAnalysis, null, 2)}

## Macro Context
- Cycle Phase: ${cyclePhase}
- Risk Level: ${macroRiskLevel}
- Summary: ${macroSummary}

## Knowledge Base Context
${knowledgeContext}

Based on the wave position, macro environment, and portfolio size, determine:
1. Which buy tranche (1/5 through 5/5) we are at, or if we should trim/exit.
2. The exact entry price, stop loss, and position size as a percentage of the portfolio.
3. Price targets for Wave 3, Wave 5, trim level, and exit level.
4. Full risk metrics including dollar risk and share count.`;

  // 4. Call the LLM for structured JSON output
  const result = await completeJSON({
    task: 'WAVE_INTERPRET',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 2000,
  });

  if (!result) {
    console.error(`[position_sizing] LLM returned null for ${ticker}`);
    return null;
  }

  // 5. Validate required fields
  const requiredFields = ['current_buy_tranche', 'recommended_action', 'stop_loss', 'position_size_pct', 'reasoning'];
  const missing = requiredFields.filter(f => result[f] == null);

  if (missing.length > 0) {
    console.error(`[position_sizing] Missing required fields for ${ticker}:`, missing);
    return null;
  }

  // 6. Enforce hard caps as a safety net
  const maxPctByCycle = {
    early_cycle: 8,
    mid_cycle: 6,
    late_cycle: 5,
    recession: 3,
    contraction: 3,
  };
  const cap = maxPctByCycle[cyclePhase] || 6;

  if (result.position_size_pct > cap) {
    console.warn(`[position_sizing] Capping ${ticker} position from ${result.position_size_pct}% to ${cap}% (cycle: ${cyclePhase})`);
    result.position_size_pct = cap;
  }

  return result;
}

module.exports = { execute };
