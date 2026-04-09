/**
 * Interpret Wave — Technical Skill
 *
 * Uses an LLM to interpret Elliott Wave position for a given ticker,
 * combining price data, moving averages, and knowledge-base context
 * with a comprehensive ruleset encoded in the system prompt.
 */

const { complete } = require('../../services/llm');
const { retrieve } = require('../../services/knowledge');

// ─── SYSTEM PROMPT — Full Elliott Wave Ruleset ───

const SYSTEM_PROMPT = `You are an expert Elliott Wave analyst. Your task is to interpret the current Elliott Wave position for a stock given its weekly prices, monthly prices, and key moving averages.

## CARDINAL RULES (never violate)
1. Wave 2 NEVER retraces below the starting point of Wave 1.
2. Wave 3 is NEVER the shortest of the three impulse waves (1, 3, 5).
3. Wave 4 CANNOT enter the price territory of Wave 2 (no overlap between the low of Wave 4 and the high of Wave 2 in an impulse).

## IMPULSE PATTERNS (motive waves — five-wave structures)
1. **Normal Impulse** — Wave 3 is the longest; Wave 1 and Wave 5 are roughly equal. Wave 3 typically extends 1.618× Wave 1.
2. **Extended Third** — Wave 3 is dramatically longer (2.618× or more of Wave 1). Most common in equities.
3. **Leading Diagonal** — Occurs in Wave 1 or Wave A position. Waves overlap (Wave 4 enters Wave 1 territory). Wedge-shaped with converging trendlines. Subdivisions are 5-3-5-3-5 or 3-3-3-3-3.
4. **Ending Diagonal** — Occurs in Wave 5 or Wave C position. Waves overlap (Wave 4 enters Wave 2 territory). Wedge-shaped. Subdivisions are 3-3-3-3-3. Signals exhaustion and imminent reversal.

## CORRECTIVE PATTERNS (three-wave structures — A-B-C)
1. **Zigzag** — Sharp correction: 5-3-5 subdivision. Wave B retraces 38.2–78.6% of Wave A.
2. **Flat** — Sideways correction: 3-3-5 subdivision. Wave B reaches approximately 100% of Wave A.
3. **Expanded Flat** — Wave B exceeds the start of Wave A; Wave C drops well below Wave A.
4. **Triangle** — Converging: 3-3-3-3-3 subdivision (A-B-C-D-E). Occurs only in Wave 4 or Wave B position.

## WAVE 4 VARIATIONS
1. **Standard Retracement** — Wave 4 retraces 23.6–38.2% of Wave 3. Simple zigzag or flat.
2. **Flat Correction** — Sideways chop; Wave 4 bottom near Wave 3 38.2% retracement.
3. **Triangle** — Contracting range with five sub-waves (A-B-C-D-E). Often precedes a swift Wave 5 thrust.
4. **Running Flat** — Wave B of the correction exceeds Wave 3 high; Wave C does not fully retrace to Wave A low. Bullish implication — strong underlying trend.

## FIBONACCI LEVELS
- **Retracement levels:** 0.236, 0.382, 0.500, 0.618, 0.786
- **Extension levels:** 1.618, 2.618

## KEY TRADING RULES
- **Wave 2 Entry Zone:** Look for entries at the 0.500–0.618 Fibonacci retracement of Wave 1. This is the optimal risk/reward zone.
- **Wave 3 Target:** Project Wave 3 target at the 1.618 Fibonacci extension of Wave 1 (measured from Wave 2 low).
- **Confluence Zone:** The most powerful buy zone is where the 200-week moving average (200WMA) aligns with the 0.618 Fibonacci retracement level. When these two converge, it represents a high-probability support area.

## OUTPUT FORMAT
Return ONLY valid JSON with this structure:
{
  "current_wave": "<1|2|3|4|5|A|B|C> with degree (e.g. 'Wave 3 of Intermediate (3)')>",
  "pattern_type": "<Normal|Extended Third|Leading Diagonal|Ending Diagonal|Zigzag|Flat|Expanded Flat|Triangle>",
  "confidence": <0.0-1.0>,
  "key_levels": {
    "wave_1_start": <price>,
    "wave_1_end": <price>,
    "wave_2_low": <price>,
    "wave_3_target": <price>,
    "wave_4_support": <price>,
    "wave_5_target": <price>,
    "invalidation": <price>,
    "fib_0236": <price>,
    "fib_0382": <price>,
    "fib_0500": <price>,
    "fib_0618": <price>,
    "fib_0786": <price>,
    "ext_1618": <price>,
    "ext_2618": <price>,
    "confluence_zone": { "low": <price>, "high": <price> }
  },
  "position_action": "<ENTER_WAVE_2|HOLD_WAVE_3|TRIM_WAVE_3_TARGET|WATCH_WAVE_4|ENTER_WAVE_4|EXIT_WAVE_5|WAIT>",
  "reasoning": "<2-4 sentence explanation of wave count and supporting evidence>"
}`;

// ─── EXECUTE ───

/**
 * Interpret Elliott Wave position for a ticker.
 *
 * @param {Object} input
 * @param {string}  input.ticker        — Stock ticker symbol
 * @param {Array}   input.weeklyPrices  — Weekly OHLCV data, oldest-first
 * @param {Array}   input.monthlyPrices — Monthly OHLCV data, oldest-first
 * @param {number}  input.sma50         — 50-period simple moving average
 * @param {number}  input.sma200        — 200-period simple moving average
 * @param {number}  input.wma200        — 200-week moving average
 * @returns {Object|null} Parsed wave interpretation or null on failure
 */
async function execute({ ticker, weeklyPrices, monthlyPrices, sma50, sma200, wma200 }) {
  // 1. Retrieve relevant knowledge-base context (Elliott Wave notes, prior analyses)
  const knowledgeChunks = await retrieve({
    query: `Elliott Wave analysis ${ticker} wave count position fibonacci`,
    ticker,
    topics: ['elliott_wave', 'technical_analysis', 'wave_count'],
    limit: 8,
  });

  const knowledgeContext = knowledgeChunks.length > 0
    ? knowledgeChunks.map(c => c.content).join('\n---\n')
    : 'No prior wave analysis found in knowledge base.';

  // 2. Summarise recent price action for the prompt
  const recentWeekly = (weeklyPrices || []).slice(-52); // last 52 weeks
  const recentMonthly = (monthlyPrices || []).slice(-36); // last 36 months

  const weeklyStr = recentWeekly
    .map(p => `${p.date}: O=${p.open} H=${p.high} L=${p.low} C=${p.close}`)
    .join('\n');

  const monthlyStr = recentMonthly
    .map(p => `${p.date}: O=${p.open} H=${p.high} L=${p.low} C=${p.close}`)
    .join('\n');

  // 3. Build the user prompt
  const userPrompt = `Analyze the Elliott Wave position for ${ticker}.

## Moving Averages
- 50-SMA: ${sma50}
- 200-SMA: ${sma200}
- 200-WMA: ${wma200}

## Weekly Prices (last 52 weeks)
${weeklyStr || 'No weekly data available.'}

## Monthly Prices (last 36 months)
${monthlyStr || 'No monthly data available.'}

## Knowledge Base Context
${knowledgeContext}

Determine the current Elliott Wave position. Identify the pattern type, calculate all key Fibonacci levels, assess the confluence zone (200WMA + 0.618 Fib), and recommend a position action.`;

  // 4. Call the LLM
  const raw = await complete({
    task: 'WAVE_INTERPRET',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 2000,
  });

  // 5. Parse JSON response
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const result = JSON.parse(cleaned);

    // Validate required fields
    if (!result.current_wave || !result.pattern_type || result.confidence == null) {
      console.error(`[interpret_wave] Missing required fields for ${ticker}:`, Object.keys(result));
      return null;
    }

    return result;
  } catch (err) {
    console.error(`[interpret_wave] JSON parse failed for ${ticker}:`, err.message, raw.slice(0, 300));
    return null;
  }
}

module.exports = { execute };
