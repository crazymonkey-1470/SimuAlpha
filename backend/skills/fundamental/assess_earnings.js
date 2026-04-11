/**
 * Earnings Quality Assessment Skill — Sprint 8
 *
 * Evaluates earnings quality using Benjamin Graham's Chapter 12
 * principles from "The Intelligent Investor." Detects earnings
 * manipulation, unsustainable reporting, and accounting red flags.
 */

const { completeJSON } = require('../../services/llm');

const SYSTEM_PROMPT = `You are a forensic accounting analyst applying Benjamin Graham's Chapter 12 earnings quality framework from "The Intelligent Investor."

GRAHAM'S CORE RULES — apply these rigorously:

1. NEVER TAKE A SINGLE YEAR'S EARNINGS SERIOUSLY
   A single year of earnings is meaningless for valuation. Always demand context from prior years. A company reporting record EPS after years of decline is suspect. A company reporting a dip after years of growth deserves benefit of the doubt.

2. USE 2-3 YEAR AVERAGES FOR ALL ASSESSMENTS
   Average EPS over the trailing 2-3 years to smooth cyclicality, one-time items, and accounting timing. Compare the 3-year average growth rate to the most recent year. If the most recent year dramatically exceeds the average, investigate why.

3. ALWAYS USE FULLY DILUTED EPS
   Basic EPS hides the dilutive impact of options, warrants, convertibles, and RSUs. Only fully diluted EPS reflects true per-share economics. If the company only highlights basic EPS, treat this as a yellow flag.

4. SPECIAL CHARGES ARE A MANIPULATION TOOL
   "Restructuring charges," "one-time write-downs," and "non-recurring items" that recur annually are NOT one-time. They shift losses between reporting periods to create an illusion of cleaner core earnings. Count the frequency of special charges over 5+ years.

5. FREE CASH FLOW > EPS = GENUINE EARNINGS
   If FCF consistently exceeds or tracks EPS, earnings are likely genuine — the company is converting reported profits into actual cash. If EPS consistently exceeds FCF, the company may be using accrual accounting aggressively. The wider the gap, the greater the risk.

6. GAAP vs NON-GAAP DIVERGENCE >20% = SUSPICIOUS
   When a company's non-GAAP "adjusted" earnings exceed GAAP earnings by more than 20%, they are systematically excluding real costs. Stock-based compensation is a REAL cost. Restructuring that happens every year is a REAL cost. Amortization of acquired intangibles reflects REAL capital allocation decisions.

7. EPS-REVENUE COHERENCE CHECK (Sprint 10C)
   If EPS is growing but revenue is flat or declining for 2+ consecutive quarters,
   earnings are being manufactured — either through cost-cutting pushed past the
   point of sustainability, buyback-driven share-count reduction, or one-time
   gains. Flag this as an EPS_REVENUE_DIVERGENCE manipulation signal.
   Formula: if (eps_growth > 5%) AND (revenue_growth <= 0) for 2+ quarters → flag.

8. HIDDEN VALUE PATTERN (UNH signal — Sprint 10C)
   If FCF is rising while EPS is flat or lagging, the company is likely
   applying accounting conservatism (aggressive non-cash amortization,
   deferred revenue booking, or heavy SBC expensing). This is the OPPOSITE
   of manipulation — it typically precedes a positive earnings surprise
   as the accrual gap closes. Flag this as HIDDEN_VALUE and suggest a
   positive score adjustment when it coincides with moat score ≥3.
   Formula: if (fcf_growth > 10%) AND (eps_growth < 3%) for 2+ quarters → flag.

GRADING SCALE:
- A: Pristine earnings quality. FCF confirms EPS. Minimal adjustments. Consistent multi-year trend.
- B: Good quality with minor concerns. FCF generally tracks EPS. Occasional one-time items but not recurring.
- C: Mixed signals. Some divergence between FCF and EPS. Moderate GAAP/non-GAAP gap. Cyclicality makes assessment harder.
- D: Poor quality. Persistent FCF < EPS. Recurring "one-time" charges. Large GAAP/non-GAAP divergence. Dilution concerns.
- F: Earnings are unreliable. Severe manipulation indicators. FCF dramatically trails EPS. Aggressive accounting across multiple dimensions.

SCORE ADJUSTMENT:
- Map the grade to a score adjustment from -5 to +5 that modifies the overall investment score.
  A = +5, B = +2, C = 0, D = -3, F = -5

Return JSON with these fields:
- quality_grade: letter grade A through F
- score_adjustment: integer from -5 to +5
- flags: array of specific concern strings (e.g., "recurring restructuring charges in 4 of 5 years", "FCF/EPS ratio of 0.4x suggests aggressive accruals")
- manipulation_risk: one of "low", "moderate", "high", "severe"
- reasoning: 3-5 sentences applying Graham's rules to the specific data provided`;

/**
 * Assess earnings quality using Graham Chapter 12 framework.
 *
 * @param {Object} input
 * @param {string} input.ticker - Stock ticker symbol
 * @param {number[]} input.epsHistory - Fully diluted EPS for last 5 years (oldest to newest)
 * @param {number[]} input.fcfHistory - Free cash flow per share for last 5 years (oldest to newest)
 * @param {number[]} input.revenueHistory - Revenue in millions for last 5 years (oldest to newest)
 * @param {number} input.operatingIncome - Most recent trailing 12-month operating income in millions
 * @param {number} input.netIncome - Most recent trailing 12-month net income in millions
 * @returns {Promise<Object>} Earnings quality assessment
 */
async function execute({ ticker, epsHistory, fcfHistory, revenueHistory, operatingIncome, netIncome }) {
  // Pre-compute analytical metrics to give the LLM concrete numbers
  const epsLen = epsHistory.length;
  const fcfLen = fcfHistory.length;

  const epsLatest = epsHistory[epsLen - 1];
  const eps3YrAvg = epsLen >= 3
    ? epsHistory.slice(epsLen - 3).reduce((a, b) => a + b, 0) / 3
    : epsLatest;

  const fcfLatest = fcfHistory[fcfLen - 1];
  const fcf3YrAvg = fcfLen >= 3
    ? fcfHistory.slice(fcfLen - 3).reduce((a, b) => a + b, 0) / 3
    : fcfLatest;

  const fcfToEpsRatio = epsLatest !== 0 ? (fcfLatest / epsLatest).toFixed(2) : 'N/A';
  const fcfToEpsAvgRatio = eps3YrAvg !== 0 ? (fcf3YrAvg / eps3YrAvg).toFixed(2) : 'N/A';

  const epsGrowthRate = epsLen >= 2 && epsHistory[0] !== 0
    ? (((epsLatest / epsHistory[0]) ** (1 / (epsLen - 1)) - 1) * 100).toFixed(1)
    : 'N/A';

  const revLen = revenueHistory.length;
  const revenueGrowthRate = revLen >= 2 && revenueHistory[0] !== 0
    ? (((revenueHistory[revLen - 1] / revenueHistory[0]) ** (1 / (revLen - 1)) - 1) * 100).toFixed(1)
    : 'N/A';

  const operatingMargin = revenueHistory[revLen - 1] !== 0
    ? ((operatingIncome / revenueHistory[revLen - 1]) * 100).toFixed(1)
    : 'N/A';

  const netMargin = revenueHistory[revLen - 1] !== 0
    ? ((netIncome / revenueHistory[revLen - 1]) * 100).toFixed(1)
    : 'N/A';

  const userPrompt = `Assess earnings quality for ${ticker} using Graham's Chapter 12 framework.

EARNINGS DATA (oldest to newest):
- EPS History (fully diluted): ${JSON.stringify(epsHistory)}
- FCF/Share History: ${JSON.stringify(fcfHistory)}
- Revenue History ($M): ${JSON.stringify(revenueHistory)}
- TTM Operating Income: $${operatingIncome}M
- TTM Net Income: $${netIncome}M

PRE-COMPUTED METRICS:
- Latest EPS: ${epsLatest} | 3-Year Avg EPS: ${eps3YrAvg.toFixed(2)}
- Latest FCF/Share: ${fcfLatest} | 3-Year Avg FCF/Share: ${fcf3YrAvg.toFixed(2)}
- FCF-to-EPS Ratio (latest): ${fcfToEpsRatio}x
- FCF-to-EPS Ratio (3yr avg): ${fcfToEpsAvgRatio}x
- EPS CAGR: ${epsGrowthRate}%
- Revenue CAGR: ${revenueGrowthRate}%
- Operating Margin: ${operatingMargin}%
- Net Margin: ${netMargin}%

Apply each of Graham's six rules explicitly. Identify every red flag.`;

  const result = await completeJSON({
    task: 'THESIS',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 2000,
  });

  if (!result) {
    return {
      quality_grade: 'C',
      score_adjustment: 0,
      flags: ['LLM assessment failed — defaulting to neutral grade'],
      manipulation_risk: 'moderate',
      reasoning: `Earnings quality assessment failed for ${ticker}. Assigning neutral grade as conservative default.`,
    };
  }

  // Validate and clamp score_adjustment to [-5, +5]
  const rawAdj = typeof result.score_adjustment === 'number' ? result.score_adjustment : 0;
  const clampedAdj = Math.max(-5, Math.min(5, Math.round(rawAdj)));

  // Validate quality_grade is a valid letter
  const validGrades = ['A', 'B', 'C', 'D', 'F'];
  const grade = validGrades.includes(result.quality_grade) ? result.quality_grade : 'C';

  // Validate manipulation_risk
  const validRisks = ['low', 'moderate', 'high', 'severe'];
  const risk = validRisks.includes(result.manipulation_risk) ? result.manipulation_risk : 'moderate';

  return {
    quality_grade: grade,
    score_adjustment: clampedAdj,
    flags: Array.isArray(result.flags) ? result.flags : [],
    manipulation_risk: risk,
    reasoning: result.reasoning || '',
  };
}

module.exports = { execute };
