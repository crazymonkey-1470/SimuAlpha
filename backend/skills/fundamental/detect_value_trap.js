/**
 * Value Trap Detection Skill — Sprint 8
 *
 * Detects value traps using lessons from hedge fund managers,
 * particularly Philippe Laffont (Coatue) on SNOW and the INTUIT
 * growth deceleration exit, and Steven Cohen's pattern recognition.
 */

const { completeJSON } = require('../../services/llm');

const SYSTEM_PROMPT = `You are a hedge fund risk analyst specializing in value trap detection. Your job is to prevent the portfolio from buying stocks that LOOK cheap but are fundamentally broken.

VALUE TRAP DETECTION FRAMEWORK:

1. THE CLASSIC VALUE TRAP FORMULA (Cohen SNOW Lesson):
   When ALL of these conditions are present simultaneously, the stock is almost certainly a value trap:
   - Revenue growth >20% (looks exciting)
   - Free cash flow NEGATIVE (growth is not self-funding)
   - P/E >100 or negative earnings (priced for perfection)
   - Increasing competition in the core market
   This combination means the market is pricing in a future monopoly that will never materialize because the company is buying growth with shareholder capital while competitors close the gap.

2. THE GROWTH DECELERATION TRAP (Laffont INTUIT Lesson):
   When revenue growth decelerates from >30% to <15% over 2-3 years, the stock almost always de-rates regardless of absolute growth level. Key insight: the RATE OF CHANGE of growth matters more than the absolute level. A company growing at 12% that was growing at 30% will be punished far more than a company that has always grown at 12%. Exit when you see deceleration from 30%+ to 12% or below — do not wait for the market to reprice.

3. THE CAPEX TRAP:
   High capital expenditure with no proportional revenue growth signals either:
   - Empire building by management (negative signal)
   - Competitive pressure requiring defensive spending (moat erosion)
   - Technology transition risk (old capex becomes worthless)
   Compare capex-to-revenue ratio over 3 years. If capex/revenue is rising but revenue growth is flat or declining, the company is running harder just to stay in place.

4. THE GLP-1 / REGULATORY PRICE PRESSURE PATTERN:
   Applies to healthcare, pharma, and any sector facing regulatory price controls:
   - Product has massive addressable market (looks bullish)
   - Government or payer pushback on pricing is building
   - Competitors entering with similar efficacy at lower price points
   - Margin compression is inevitable even if volume grows
   This pattern catches companies where revenue may grow but earnings will compress. The market eventually prices earnings, not revenue.

TRAP TYPES:
- GROWTH_MIRAGE: High revenue growth masking negative unit economics (Cohen SNOW pattern)
- DECELERATION: Growth rate declining — market will de-rate (Laffont INTUIT pattern)
- CAPEX_SINKHOLE: Rising capex without proportional revenue — diminishing returns on investment
- REGULATORY_SQUEEZE: Revenue growth offset by margin compression from regulatory or competitive pricing pressure
- MULTIPLE_TRAPS: Two or more trap types present simultaneously (highest severity)

SEVERITY LEVELS:
- critical: Multiple trap indicators present. Strong sell / do not buy signal.
- high: Primary trap pattern clearly identified. Avoid unless thesis is exceptionally strong.
- moderate: Some trap indicators present but mitigating factors exist. Proceed with caution and reduced position size.
- low: Minor warning signs only. Standard risk management sufficient.

Return JSON with these fields:
- is_value_trap: boolean — true if the stock meets value trap criteria
- trap_type: one of GROWTH_MIRAGE, DECELERATION, CAPEX_SINKHOLE, REGULATORY_SQUEEZE, MULTIPLE_TRAPS, or NONE
- severity: one of "critical", "high", "moderate", "low"
- override_buy_signal: boolean — true if the trap detection should OVERRIDE any buy signal from other skills. Only true for "critical" or "high" severity.
- reasoning: 3-5 sentences explaining the specific trap pattern detected with reference to the Cohen/Laffont lessons where applicable`;

/**
 * Detect whether a stock is a value trap.
 *
 * @param {Object} input
 * @param {string} input.ticker - Stock ticker symbol
 * @param {number} input.revenueGrowth - Year-over-year revenue growth as percentage (e.g., 25.0)
 * @param {number} input.fcfMargin - Free cash flow margin as percentage (e.g., -5.0 for negative FCF)
 * @param {number} input.pe - Price-to-earnings ratio (use 999 for negative earnings)
 * @param {number} input.capex - Capital expenditure as percentage of revenue (e.g., 35.0)
 * @param {string} input.competition - Description of competitive landscape
 * @param {string} input.sector - Industry sector
 * @returns {Promise<Object>} Value trap detection result
 */
async function execute({ ticker, revenueGrowth, fcfMargin, pe, capex, competition, sector }) {
  // Pre-compute rule-based trap signals to augment LLM analysis
  const signals = [];

  // Cohen SNOW pattern check
  const cohenTrap = revenueGrowth > 20 && fcfMargin < 0 && pe > 100;
  if (cohenTrap) {
    signals.push('COHEN_SNOW_PATTERN: Revenue growth >20%, negative FCF, P/E >100 — classic value trap formula triggered.');
  }

  // Capex sinkhole check
  if (capex > 30 && revenueGrowth < 15) {
    signals.push(`CAPEX_SINKHOLE: Capex at ${capex}% of revenue but revenue growth only ${revenueGrowth}% — diminishing returns on capital investment.`);
  }

  // GLP-1 / regulatory pattern check
  const regulatoryRiskSectors = ['healthcare', 'pharma', 'biotech', 'pharmaceuticals', 'health care'];
  const isRegulatorySector = regulatoryRiskSectors.some(s => sector.toLowerCase().includes(s));
  if (isRegulatorySector && revenueGrowth > 15 && fcfMargin < 10) {
    signals.push('REGULATORY_PRESSURE: High-growth healthcare/pharma with thin FCF margins — vulnerable to GLP-1 style pricing pressure.');
  }

  // Negative earnings flag
  if (pe >= 999 || pe < 0) {
    signals.push('NEGATIVE_EARNINGS: Company has no positive earnings — all growth is currently unprofitable.');
  }

  const preComputedSignals = signals.length > 0
    ? signals.join('\n')
    : 'No rule-based trap signals triggered.';

  const userPrompt = `Evaluate whether ${ticker} is a value trap.

QUANTITATIVE DATA:
- Ticker: ${ticker}
- Sector: ${sector}
- Revenue Growth (YoY): ${revenueGrowth}%
- FCF Margin: ${fcfMargin}%
- P/E Ratio: ${pe === 999 ? 'N/A (negative earnings)' : pe}
- Capex / Revenue: ${capex}%
- Competitive Landscape: ${competition}

PRE-COMPUTED TRAP SIGNALS:
${preComputedSignals}

Apply the four trap detection patterns. Be specific about which pattern applies and reference the Cohen or Laffont lessons where relevant.`;

  const result = await completeJSON({
    task: 'THESIS',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 1500,
  });

  if (!result) {
    // Conservative fallback: if rule-based signals fired, flag as potential trap
    const fallbackIsTrap = signals.length >= 2;
    return {
      is_value_trap: fallbackIsTrap,
      trap_type: fallbackIsTrap ? 'MULTIPLE_TRAPS' : 'NONE',
      severity: fallbackIsTrap ? 'high' : 'low',
      override_buy_signal: fallbackIsTrap,
      reasoning: `LLM analysis failed for ${ticker}. Rule-based pre-screening found ${signals.length} trap signal(s). ${fallbackIsTrap ? 'Flagging as potential value trap based on quantitative signals alone.' : 'Insufficient signals to flag as trap without LLM confirmation.'}`,
    };
  }

  // Validate trap_type
  const validTrapTypes = ['GROWTH_MIRAGE', 'DECELERATION', 'CAPEX_SINKHOLE', 'REGULATORY_SQUEEZE', 'MULTIPLE_TRAPS', 'NONE'];
  const trapType = validTrapTypes.includes(result.trap_type) ? result.trap_type : 'NONE';

  // Validate severity
  const validSeverities = ['critical', 'high', 'moderate', 'low'];
  const severity = validSeverities.includes(result.severity) ? result.severity : 'low';

  // override_buy_signal should only be true for critical/high severity traps
  const overrideBuy = (severity === 'critical' || severity === 'high') && result.is_value_trap === true;

  return {
    is_value_trap: result.is_value_trap === true,
    trap_type: trapType,
    severity,
    override_buy_signal: overrideBuy,
    reasoning: result.reasoning || '',
  };
}

module.exports = { execute };
