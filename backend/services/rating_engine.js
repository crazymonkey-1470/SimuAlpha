/**
 * Rating Engine — Sprint 10B
 *
 * Assigns investment ratings from composite valuation upside,
 * with quality, opportunity-cost, declining-fundamentals,
 * and leverage override rules.
 */

function assignRating(stock, composite, moatScore, lynchCategory) {
  const upside = composite.compositeUpside;
  const revenueGrowth = stock.revenueGrowthYoY || 0;
  const ebitdaGrowth = stock.ebitdaGrowthYoY || 0;

  let rating;

  // Base rating from upside
  if (upside > 30) rating = 'STRONG_BUY';
  else if (upside > 10) rating = 'BUY';
  else if (upside > -5) rating = 'NEUTRAL';
  else if (upside > -20) rating = 'REDUCE';
  else rating = 'SELL';

  // OVERRIDE: Quality floor — high moat upgrades from Sell → Neutral
  if (rating === 'SELL' && moatScore >= 4 && upside > -10) {
    rating = 'NEUTRAL';
  }

  // OVERRIDE: Opportunity cost — if upside < 8-10% (S&P expected), cap at Neutral
  if (upside < 8 && !['REDUCE', 'SELL'].includes(rating)) {
    if (rating === 'BUY') rating = 'NEUTRAL';
  }

  // OVERRIDE: Declining revenue AND EBITDA caps at HOLD regardless
  if (revenueGrowth < 0 && ebitdaGrowth < 0) {
    if (['STRONG_BUY', 'BUY'].includes(rating)) {
      rating = 'NEUTRAL';
    }
  }

  // OVERRIDE: Leverage penalty
  if (stock.debtToEbitda > 4 && stock.sector !== 'Financials') {
    if (rating === 'STRONG_BUY') rating = 'BUY';
    else if (rating === 'BUY') rating = 'NEUTRAL';
  }

  return {
    rating,
    compositeUpside: upside,
    totalReturn: composite.totalReturn,
  };
}

module.exports = { assignRating };
