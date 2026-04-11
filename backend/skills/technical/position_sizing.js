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

const SYSTEM_PROMPT = `You are a position sizing advisor implementing the TLI (Top-Level Investor) 5-tranche DCA system with INCREASING sizes as confirmation builds. Given a stock's Elliott Wave analysis, current price, portfolio size, and macro context, recommend an exact position sizing action.

## FUNDAMENTAL GATE — MANDATORY PRE-CHECK
BEFORE any entry, add, or re-entry action, verify the Fundamental Gate has passed:
- Revenue growth ≥ 0 (no collapse)
- Gross margin not declining >500bps YoY
- Operating leverage positive (EBITDA growing ≥ revenue growth)
- Share count not expanding >3%/year (no mass dilution)
If the gate has failed, recommended_action MUST be NO_ACTION regardless of wave count.

## TLI 5-TRANCHE DCA SYSTEM (Sprint 10B — INCREASING sizes)
Positions are built in five INCREASING tranches as confirmation accumulates through
the wave cycle. NEVER equal tranches — conviction scales with evidence.

Tranche schedule (cumulative allocation):
- **Tranche 1/5 — 10% (Starter/Probe):** Wave C approaching support. First probe at 0.618 Fib. Cumulative 10%.
- **Tranche 2/5 — 15% (Confirm):** Support confirmed (higher low formed). 200WMA + Fib zone holds. Cumulative 25%.
- **Tranche 3/5 — 20% (Reversal):** Signs of reversal — higher high printed. Cumulative 45%.
- **Tranche 4/5 — 25% (Trend):** Trend confirmed (HH + HL series). Wave 1 structure validated. Cumulative 70%.
- **Tranche 5/5 — 30% (Wave 2 Completion):** 0.50-0.618 Fib holds on retest. Final add before Wave 3 launch. Cumulative 100%.

The 10/15/20/25/30 schedule means you commit the most capital when the trade
has the most evidence. Never buy a full position at once. If confirmations
reverse, stop adding and reassess.

## WAVE-BASED TRIM SCHEDULE (Sprint 10B)
- **WAVE_3_TOP:** Trim 20% at 1.618 extension target. Remaining 80%. Next: wait for Wave 4 pullback.
- **WAVE_4_COMPLETE:** Add back to full allocation (re-establish 100%). Next: hold for Wave 5.
- **WAVE_5_TOP:** Trim 50% at Wave 5 target or ending diagonal signal. Remaining 50%. Next: defensive — impulse complete.
- **WAVE_A_COMPLETE:** Re-enter IF fundamentals still pass the gate. Otherwise exit.
- **WAVE_B_REJECTION:** Trim on rejection at 0.382/0.5 of Wave A. Wait for Wave C.
- **WAVE_C_COMPLETE:** Full cycle restart. Resume the 5-tranche DCA from zero.

## STOP LOSS RULES

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
Return ONLY valid JSON. Tranche percentages MUST follow the 10/15/20/25/30
schedule — never propose equal or custom tranche sizes.

{
  "current_buy_tranche": "<0/5|1/5|2/5|3/5|4/5|5/5>",
  "tranche_pct": <10|15|20|25|30>,
  "cumulative_pct": <10|25|45|70|100>,
  "recommended_action": "<TRANCHE_1_10PCT|TRANCHE_2_15PCT|TRANCHE_3_20PCT|TRANCHE_4_25PCT|TRANCHE_5_30PCT|TRIM_WAVE_3_20PCT|TRIM_WAVE_5_50PCT|RE_ADD_WAVE_4|FULL_CYCLE_RESTART|HOLD|NO_ACTION>",
  "entry_price": <number or null>,
  "stop_loss": <number>,
  "position_size_pct": <number — percentage of portfolio for this tranche>,
  "fundamental_gate_pass": <boolean — must be true for any entry action>,
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
  "reasoning": "<2-4 sentence explanation citing fundamental gate status, tranche number, and wave trigger. Use TLI language rules — never say 'buy' or 'sell' — say 'scaling in at tranche N/5', 'trim zone reached', 'target achieved'.>"
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
