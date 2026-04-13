/**
 * Skill: Three-Pillar Valuation
 *
 * Runs DCF + EV/Sales + EV/EBITDA valuation via the valuation engine,
 * then calls the LLM to produce a narrative assessment of the result.
 *
 * execute({ ticker, stock }) -> { valuation, score, narrative }
 */

const log = require('../../services/logger').child({ module: 'three_pillar_value' });
const { computeThreePillarValuation, scoreValuation } = require('../../services/valuation');
const { complete } = require('../../services/llm');

const SYSTEM_PROMPT = `You are a senior equity analyst specializing in intrinsic-value estimation.
Given a three-pillar valuation result (DCF, EV/Sales, EV/EBITDA), write a concise 2-4 sentence
narrative assessment. Cover:
1. Whether the stock appears undervalued, fairly valued, or overvalued and by how much.
2. Which pillar is most reliable for this company and why.
3. Any caveats (e.g. negative FCF makes DCF unreliable, cyclical sector distorts multiples).
Be direct, quantitative, and avoid hedge-fund jargon.`;

async function execute({ ticker, stock }) {
  if (!ticker) throw new Error('[three_pillar_value] ticker is required');
  if (!stock) throw new Error('[three_pillar_value] stock data is required');

  // Build the input object the valuation engine expects
  const valuationInput = {
    currentPrice: stock.current_price ?? stock.currentPrice,
    sector: stock.sector,
    marketCap: stock.market_cap ?? stock.marketCap,
    beta: stock.beta,
    debtToEquity: stock.debt_to_equity ?? stock.debtToEquity,
    totalDebt: stock.total_debt ?? stock.totalDebt,
    cashAndEquivalents: stock.cash_and_equivalents ?? stock.cashAndEquivalents,
    freeCashFlow: stock.free_cash_flow ?? stock.freeCashFlow,
    ttmFCF: stock.free_cash_flow ?? stock.ttmFCF ?? stock.freeCashFlow,
    revenueCurrent: stock.revenue_current ?? stock.revenueCurrent,
    ttmRevenue: stock.revenue_current ?? stock.ttmRevenue ?? stock.revenueCurrent,
    revenueGrowth3YrAvg: stock.revenue_growth_3yr ?? stock.revenueGrowth3YrAvg,
    fcfGrowth3YrAvg: stock.fcf_growth_yoy ?? stock.fcfGrowth3YrAvg,
    dilutedShares: stock.diluted_shares ?? stock.dilutedShares,
    sharesOutstanding: stock.shares_outstanding ?? stock.sharesOutstanding,
    historicalEVSales5YrAvg: stock.historical_ev_sales ?? stock.historicalEVSales5YrAvg ?? null,
    historicalEVEBITDA5YrAvg: stock.historical_ev_ebitda ?? stock.historicalEVEBITDA5YrAvg ?? null,
    ttmEBITDA: stock.ttm_ebitda ?? stock.ttmEBITDA ?? null,
  };

  // Run the valuation engine
  const valuation = computeThreePillarValuation(valuationInput);

  if (!valuation) {
    return {
      valuation: null,
      score: { pts: 0, flags: [], rating: null },
      narrative: `Insufficient data to compute a three-pillar valuation for ${ticker}. Missing price, FCF, revenue, or shares outstanding.`,
    };
  }

  // Score the valuation for the TLI system
  const score = scoreValuation(valuation);

  // Generate LLM narrative
  let narrative;
  try {
    const userPrompt = `Ticker: ${ticker}
Current Price: $${valuation.currentPrice}
Average Target: $${valuation.avgTarget} (${valuation.avgUpside > 0 ? '+' : ''}${valuation.avgUpside}%)
Rating: ${valuation.rating}
WACC: ${valuation.wacc}% (${valuation.waccTier} risk)

DCF Target: ${valuation.dcf.target != null ? `$${valuation.dcf.target} (${valuation.dcf.upside > 0 ? '+' : ''}${valuation.dcf.upside}%)` : 'N/A — insufficient FCF data'}
  Growth Rate: ${valuation.dcf.growthRate}%, Terminal: ${valuation.dcf.terminalRate}%
EV/Sales Target: ${valuation.evSales.target != null ? `$${valuation.evSales.target} (${valuation.evSales.upside > 0 ? '+' : ''}${valuation.evSales.upside}%)` : 'N/A'}
  Multiple: ${valuation.evSales.multiple}x
EV/EBITDA Target: ${valuation.evEbitda.target != null ? `$${valuation.evEbitda.target} (${valuation.evEbitda.upside > 0 ? '+' : ''}${valuation.evEbitda.upside}%)` : 'N/A'}
  Multiple: ${valuation.evEbitda.multiple}x

Sector: ${stock.sector || 'Unknown'}
Score Flags: ${score.flags.length > 0 ? score.flags.join(', ') : 'None'}`;

    narrative = await complete({
      task: 'THESIS',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 500,
    });
  } catch (err) {
    log.error({ err, ticker }, 'LLM narrative failed');
    narrative = `Valuation complete for ${ticker}: avg target $${valuation.avgTarget} (${valuation.avgUpside > 0 ? '+' : ''}${valuation.avgUpside}% upside). Rating: ${valuation.rating}. WACC tier: ${valuation.waccTier}.`;
  }

  return { valuation, score, narrative };
}

module.exports = { execute };
