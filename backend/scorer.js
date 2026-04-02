/**
 * TLI Scoring Algorithm
 * Fundamental (50 pts) + Technical (50 pts) = Total (0-100)
 *
 * If a data point is null, that component is skipped (0 pts, not penalized).
 */

function calculateFundamentalScore({ revenueGrowthPct, pctFrom52wHigh, psRatio, peRatio }) {
  let score = 0;

  // Revenue YoY growth (max 15 pts)
  if (revenueGrowthPct != null) {
    if (revenueGrowthPct >= 15) score += 15;
    else if (revenueGrowthPct >= 8) score += 10;
    else if (revenueGrowthPct > 0) score += 5;
  }

  // Price vs 52-week high (max 15 pts)
  if (pctFrom52wHigh != null) {
    const pctBelow = Math.abs(pctFrom52wHigh);
    if (pctBelow >= 50) score += 15;
    else if (pctBelow >= 30) score += 10;
    else if (pctBelow >= 15) score += 5;
  }

  // P/S ratio (max 10 pts)
  if (psRatio != null && psRatio > 0) {
    if (psRatio < 2) score += 10;
    else if (psRatio < 5) score += 5;
  }

  // P/E ratio (max 10 pts)
  if (peRatio != null && peRatio > 0) {
    if (peRatio < 15) score += 10;
    else if (peRatio < 20) score += 5;
  }

  return score;
}

function calculateTechnicalScore({ pctFrom200WMA, pctFrom200MMA }) {
  let score = 0;

  // Price vs 200 WMA (max 25 pts)
  if (pctFrom200WMA != null) {
    if (pctFrom200WMA <= 0) score += 25;
    else if (pctFrom200WMA <= 5) score += 15;
    else if (pctFrom200WMA <= 15) score += 5;
  }

  // Price vs 200 MMA (max 25 pts)
  if (pctFrom200MMA != null) {
    if (pctFrom200MMA <= 0) score += 25;
    else if (pctFrom200MMA <= 5) score += 15;
    else if (pctFrom200MMA <= 10) score += 5;
  }

  return score;
}

function getSignal(totalScore) {
  if (totalScore >= 75) return 'LOAD THE BOAT';
  if (totalScore >= 60) return 'ACCUMULATE';
  return 'WATCH';
}

function scoreTicker({ currentPrice, week52High, price200WMA, price200MMA, revenueGrowthPct, psRatio, peRatio }) {
  const pctFrom52wHigh = (week52High != null && currentPrice != null)
    ? ((currentPrice - week52High) / week52High) * 100
    : null;

  const pctFrom200WMA = (price200WMA != null && currentPrice != null)
    ? ((currentPrice - price200WMA) / price200WMA) * 100
    : null;

  const pctFrom200MMA = (price200MMA != null && currentPrice != null)
    ? ((currentPrice - price200MMA) / price200MMA) * 100
    : null;

  const fundamentalScore = calculateFundamentalScore({ revenueGrowthPct, pctFrom52wHigh, psRatio, peRatio });
  const technicalScore = calculateTechnicalScore({ pctFrom200WMA, pctFrom200MMA });
  const totalScore = fundamentalScore + technicalScore;
  const signal = getSignal(totalScore);

  return {
    pctFrom52wHigh: pctFrom52wHigh != null ? Math.round(pctFrom52wHigh * 10) / 10 : null,
    pctFrom200WMA: pctFrom200WMA != null ? Math.round(pctFrom200WMA * 10) / 10 : null,
    pctFrom200MMA: pctFrom200MMA != null ? Math.round(pctFrom200MMA * 10) / 10 : null,
    fundamentalScore,
    technicalScore,
    totalScore,
    signal,
  };
}

module.exports = { scoreTicker, getSignal };
