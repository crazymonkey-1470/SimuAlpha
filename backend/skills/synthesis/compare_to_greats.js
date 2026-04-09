/**
 * Skill: Compare to the Greats
 *
 * For each of 9 legendary investors, determines BUY/HOLD/SELL/AVOID and a
 * one-sentence rationale based on their known investment framework.
 *
 * execute({ ticker, stockData, scoreResult })
 * -> { opinions: [{ investor, action, reasoning }] }
 */

const { completeJSON } = require('../../services/llm');

const SYSTEM_PROMPT = `You are an expert who can channel the investment philosophy of 9 legendary investors. For each investor, determine their likely action on a stock (BUY, HOLD, SELL, or AVOID) and provide a one-sentence rationale in their voice.

THE NINE INVESTORS AND THEIR FRAMEWORKS:

1. Buffett/Abel (Berkshire Hathaway): Durable competitive advantages, predictable earnings, high ROIC, strong management. Pays fair price for wonderful business. Avoids what he doesn't understand. Now cautious on AI capex. Cash pile signals late-cycle caution.

2. David Tepper (Appaloosa): Distressed and deep-value contrarian. Buys when everyone is panicking. Loves cyclical recovery plays trading at single-digit P/E. Goes big when risk/reward is asymmetric. "The animal spirits are not out there yet."

3. Stanley Druckenmiller (Duquesne): Top-down macro plus bottom-up. Follows liquidity and credit cycles. Makes concentrated bets on secular trends. Will pay up for growth if macro tailwinds align. Quick to cut losses.

4. Chase Coleman (Tiger Global): Growth at scale. Wants >20% revenue growth, expanding TAM, network effects, platform dominance. Will pay premium multiples for best-in-class growth. Has pivoted to AI infrastructure.

5. Steve Cohen (Point72): Quantitative edge + fundamental catalysts. Focuses on earnings surprise potential, short-term momentum, and event-driven opportunities. Values FCF yield and margin expansion. Learned from SNOW — avoids high-multiple, no-FCF names.

6. Paul Tudor Jones (Tudor): Macro trader. Uses 200-day moving averages as primary trend filter. If below 200DMA, sell or avoid. Carry trade dynamics, dollar strength, and rate differentials drive allocation. "The most important rule is to play great defense."

7. Philippe Laffont (Coatue): Growth quality filter. Revenue acceleration is king — if growth decelerates >25%, exit immediately. Wants >30% revenue growth, positive FCF trajectory, and sector leadership. Rotates aggressively into next growth wave.

8. Howard Marks (Oaktree): Risk-first thinking. Where are we in the cycle? Is the market pricing in too much optimism? Prefers to buy when others are fearful. Values margin of safety above all. "You can't predict, you can prepare."

9. Benjamin Graham (The Intelligent Investor): Net-net value, margin of safety >33%, P/E under 15, P/B under 1.5, current ratio >2. Avoid speculation. The market is a voting machine short-term, weighing machine long-term.

RULES:
- Each investor MUST have exactly one of: BUY, HOLD, SELL, AVOID
- Each reasoning MUST be one sentence, max 30 words
- Be faithful to each investor's known style — don't make them all agree
- Use specific data points from the stock to justify each opinion
- It's perfectly fine (and expected) for investors to disagree

Respond with JSON: { "opinions": [{ "investor": "...", "action": "BUY|HOLD|SELL|AVOID", "reasoning": "..." }, ...] }`;

async function execute({ ticker, stockData, scoreResult }) {
  if (!ticker) throw new Error('[compare_to_greats] ticker is required');

  // Build a comprehensive data summary for the LLM
  const dataPoints = [`Ticker: ${ticker}`];

  if (stockData) {
    const s = stockData;
    dataPoints.push(`Current Price: $${s.current_price ?? s.currentPrice ?? 'N/A'}`);
    dataPoints.push(`Sector: ${s.sector || 'N/A'}`);
    dataPoints.push(`Market Cap: ${formatLarge(s.market_cap ?? s.marketCap)}`);
    dataPoints.push(`P/E Ratio: ${s.pe_ratio ?? s.peRatio ?? 'N/A'}`);
    dataPoints.push(`Forward P/E: ${s.forward_pe ?? s.forwardPE ?? 'N/A'}`);
    dataPoints.push(`P/S Ratio: ${s.ps_ratio ?? s.psRatio ?? 'N/A'}`);
    dataPoints.push(`P/B Ratio: ${s.pb_ratio ?? s.pbRatio ?? 'N/A'}`);
    dataPoints.push(`Revenue Growth (3yr avg): ${pctFmt(s.revenue_growth_3yr ?? s.revenueGrowth3YrAvg)}`);
    dataPoints.push(`Revenue Growth QoQ: ${pctFmt(s.revenue_growth_qoq ?? s.revenueGrowthQoQ)}`);
    dataPoints.push(`FCF Margin: ${pctFmt(s.fcf_margin ?? s.fcfMargin)}`);
    dataPoints.push(`FCF Growth YoY: ${pctFmt(s.fcf_growth_yoy ?? s.fcfGrowthYoY)}`);
    dataPoints.push(`Gross Margin: ${pctFmt(s.gross_margin_current ?? s.grossMarginCurrent)}`);
    dataPoints.push(`Debt-to-Equity: ${s.debt_to_equity ?? s.debtToEquity ?? 'N/A'}`);
    dataPoints.push(`Dividend Yield: ${pctFmt(s.dividend_yield ?? s.dividendYield)}`);
    dataPoints.push(`Beta: ${s.beta ?? 'N/A'}`);
    dataPoints.push(`52w High: $${s.week_52_high ?? s.week52High ?? 'N/A'}`);
    dataPoints.push(`52w Low: $${s.week_52_low ?? s.week52Low ?? 'N/A'}`);
    dataPoints.push(`% from 200WMA: ${pctFmt(s.pct_from_200wma ?? s.pctFrom200WMA)}`);
    dataPoints.push(`% from 200MMA: ${pctFmt(s.pct_from_200mma ?? s.pctFrom200MMA)}`);
    dataPoints.push(`Current Ratio: ${s.current_ratio ?? s.currentRatio ?? 'N/A'}`);
    dataPoints.push(`ROIC: ${pctFmt(s.roic)}`);
    dataPoints.push(`Shares Outstanding Change: ${pctFmt(s.shares_outstanding_change ?? s.sharesOutstandingChange)}`);
    dataPoints.push(`CapEx: ${formatLarge(s.capex)}`);
    dataPoints.push(`Earnings Within 14 Days: ${s.earnings_within_14_days ?? s.earningsWithin14Days ?? 'N/A'}`);
  }

  if (scoreResult) {
    dataPoints.push(`\nTLI SCORE RESULT:`);
    dataPoints.push(`  Signal: ${scoreResult.signal || 'N/A'}`);
    dataPoints.push(`  Total Score: ${scoreResult.totalScore ?? 'N/A'}/100`);
    dataPoints.push(`  Entry Zone: ${scoreResult.entryZone ? 'YES' : 'NO'}`);
    dataPoints.push(`  Confluence Zone: ${scoreResult.confluenceZone ? 'YES' : 'NO'}`);
    dataPoints.push(`  Generational Buy: ${scoreResult.generationalBuy ? 'YES' : 'NO'}`);
    dataPoints.push(`  Flags: ${scoreResult.flags?.join(', ') || 'None'}`);
  }

  const userPrompt = dataPoints.join('\n');

  let result;
  try {
    result = await completeJSON({
      task: 'COMPARE_GREATS',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 2000,
    });
  } catch (err) {
    console.error(`[compare_to_greats] LLM comparison failed for ${ticker}:`, err.message);
  }

  // Validate response structure
  if (result && Array.isArray(result.opinions) && result.opinions.length > 0) {
    const validActions = ['BUY', 'HOLD', 'SELL', 'AVOID'];
    const validated = result.opinions
      .filter(o => o.investor && o.action && o.reasoning)
      .map(o => ({
        investor: String(o.investor),
        action: validActions.includes(o.action.toUpperCase()) ? o.action.toUpperCase() : 'HOLD',
        reasoning: String(o.reasoning),
      }));

    if (validated.length > 0) {
      return { opinions: validated };
    }
  }

  // Fallback: return a basic structure indicating failure
  console.error(`[compare_to_greats] Invalid or empty LLM response for ${ticker}`);
  const investors = [
    'Buffett/Abel', 'Tepper', 'Druckenmiller', 'Coleman', 'Cohen',
    'Tudor Jones', 'Laffont', 'Marks', 'Graham',
  ];
  return {
    opinions: investors.map(name => ({
      investor: name,
      action: 'HOLD',
      reasoning: `Insufficient data to determine ${name}'s likely position on ${ticker}.`,
    })),
  };
}

// ── Helpers ──

function formatLarge(val) {
  if (val == null) return 'N/A';
  const num = Number(val);
  if (!isFinite(num)) return 'N/A';
  if (Math.abs(num) >= 1e12) return `$${(num / 1e12).toFixed(1)}T`;
  if (Math.abs(num) >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(0)}M`;
  return `$${num.toLocaleString()}`;
}

function pctFmt(val) {
  if (val == null || !isFinite(val)) return 'N/A';
  return `${Number(val) > 0 ? '+' : ''}${Number(val).toFixed(1)}%`;
}

module.exports = { execute };
