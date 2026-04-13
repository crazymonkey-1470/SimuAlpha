/**
const log = require('../../services/logger').child({ module: 'assess_macro' });
 * Skill: Assess Macro Environment
 *
 * Gets the latest macro_context from Supabase, then calls the LLM to
 * assess macro impact on a specific stock/sector.
 *
 * execute({ ticker, sector }) -> { risk_level, impact_assessment, carry_trade_relevant, reasoning }
 */

const supabase = require('../../services/supabase');
const { completeJSON } = require('../../services/llm');

const SYSTEM_PROMPT = `You are a macro strategist who assesses how current macroeconomic conditions
affect individual stocks. Given macro indicators and a target stock/sector, produce a structured
assessment covering:
1. Overall risk level for this specific stock in the current environment (LOW / MODERATE / ELEVATED / HIGH).
2. How macro conditions (rates, dollar, carry trade, VIX, geopolitics) specifically impact this stock.
3. Whether carry trade dynamics are relevant to this stock (yes/no with reasoning).
4. Specific reasoning connecting macro data points to the stock's business model and sector.

Consider:
- Rate-sensitive sectors (REITs, utilities, banks) are directly impacted by fed rate.
- Export-heavy companies are hurt by strong dollar (DXY).
- Carry trade unwinds hit leveraged and high-beta names hardest.
- Late-cycle positioning by super investors signals caution.
- High VIX environments favor quality/low-beta over growth.

Respond with JSON: { "risk_level": "...", "impact_assessment": "...", "carry_trade_relevant": true/false, "reasoning": "..." }`;

async function execute({ ticker, sector }) {
  if (!ticker) throw new Error('[assess_macro] ticker is required');

  // Fetch latest macro context
  let macroContext = null;
  try {
    const { data, error } = await supabase
      .from('macro_context')
      .select('*')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      log.error(`[assess_macro] Failed to fetch macro context:`, error.message);
    } else {
      macroContext = data;
    }
  } catch (err) {
    log.error(`[assess_macro] Macro context query error:`, err.message);
  }

  // If no macro data, return a conservative default
  if (!macroContext) {
    return {
      risk_level: 'MODERATE',
      impact_assessment: `No macro context data available. Defaulting to moderate risk for ${ticker}.`,
      carry_trade_relevant: false,
      reasoning: 'Unable to assess macro impact — macro_context table is empty or inaccessible.',
    };
  }

  // Build the LLM prompt
  const userPrompt = `Target: ${ticker} (Sector: ${sector || 'Unknown'})

MACRO CONTEXT (as of ${macroContext.date || 'latest'}):
  Market Risk Level: ${macroContext.market_risk_level || 'N/A'}
  Late Cycle Score: ${macroContext.late_cycle_score ?? 'N/A'} (0-12 scale)
  S&P 500 P/E: ${macroContext.sp500_pe ?? 'N/A'} (140yr avg: 17x, ratio: ${macroContext.sp500_pe_vs_140yr_avg ?? 'N/A'}x)
  VIX: ${macroContext.vix ?? 'N/A'}
  Fed Rate: ${macroContext.fed_rate ?? 'N/A'}%
  BOJ Rate: ${macroContext.boj_rate ?? 'N/A'}%
  DXY (Dollar Index): ${macroContext.dxy_index ?? 'N/A'}
  EUR/USD Basis: ${macroContext.eur_usd_basis ?? 'N/A'}
  Carry Spread: ${macroContext.carry_spread ?? 'N/A'}
  Carry Trade Risk: ${macroContext.carry_trade_risk || 'N/A'}
  JPY Near Intervention: ${macroContext.jpy_near_intervention ?? 'N/A'}
  Geopolitical Risk: ${macroContext.geopolitical_risk_level || 'N/A'}
  Iran War Active: ${macroContext.iran_war_active ?? 'N/A'}
  Investors Going Defensive: ${macroContext.investors_defensive_count ?? 'N/A'}/8
  SPY Puts Count: ${macroContext.spy_puts_count ?? 'N/A'}
  Berkshire Cash/Equity Ratio: ${macroContext.berkshire_cash_equity_ratio ?? 'N/A'}

Assess the macro impact on ${ticker} specifically.`;

  let result;
  try {
    result = await completeJSON({
      task: 'MACRO_ASSESS',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 800,
    });
  } catch (err) {
    log.error(`[assess_macro] LLM assessment failed for ${ticker}:`, err.message);
  }

  // Validate and return
  if (result && result.risk_level) {
    const validLevels = ['LOW', 'MODERATE', 'ELEVATED', 'HIGH'];
    if (!validLevels.includes(result.risk_level)) {
      result.risk_level = 'MODERATE';
    }
    return {
      risk_level: result.risk_level,
      impact_assessment: result.impact_assessment || '',
      carry_trade_relevant: Boolean(result.carry_trade_relevant),
      reasoning: result.reasoning || '',
    };
  }

  // Fallback: derive risk level from macro context directly
  const riskLevel = macroContext.market_risk_level === 'RED' ? 'HIGH'
    : macroContext.market_risk_level === 'ORANGE' ? 'ELEVATED'
    : macroContext.market_risk_level === 'YELLOW' ? 'MODERATE'
    : 'LOW';

  return {
    risk_level: riskLevel,
    impact_assessment: `Macro risk level is ${macroContext.market_risk_level || 'unknown'} with late cycle score ${macroContext.late_cycle_score ?? 'N/A'}/12. LLM assessment unavailable.`,
    carry_trade_relevant: macroContext.carry_trade_risk === 'HIGH',
    reasoning: `Derived from macro context market_risk_level=${macroContext.market_risk_level}. VIX=${macroContext.vix ?? 'N/A'}, DXY=${macroContext.dxy_index ?? 'N/A'}.`,
  };
}

module.exports = { execute };
