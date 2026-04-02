/**
 * TLI Scoring Algorithm
 * Total score 0–100 based on Fundamental (50pts) + Technical (50pts)
 */

/**
 * Calculate fundamental score (0–50 points)
 */
export function calculateFundamentalScore({ revenueGrowthPct, psRatio, peRatio, pctFrom52wHigh }) {
  let score = 0;

  // Revenue growth YoY (max 15pts)
  if (revenueGrowthPct != null) {
    if (revenueGrowthPct > 15) score += 15;
    else if (revenueGrowthPct > 8) score += 10;
    else if (revenueGrowthPct > 0) score += 5;
  }

  // P/S Ratio below 5-year average — simplified: below 5 is considered undervalued (max 10pts)
  if (psRatio != null && psRatio < 5) {
    score += 10;
  }

  // P/E below sector median — simplified: below 25 is considered reasonable (max 10pts)
  if (peRatio != null && peRatio > 0 && peRatio < 25) {
    score += 10;
  }

  // Price vs. 52-week high (max 15pts)
  if (pctFrom52wHigh != null) {
    const pctBelow = Math.abs(pctFrom52wHigh);
    if (pctBelow >= 50) score += 15;
    else if (pctBelow >= 30) score += 10;
    else if (pctBelow >= 15) score += 5;
  }

  return score;
}

/**
 * Calculate technical score (0–50 points)
 */
export function calculateTechnicalScore({ pctFrom200WMA, pctFrom200MMA }) {
  let score = 0;

  // Price vs 200 WMA (max 25pts)
  if (pctFrom200WMA != null) {
    if (pctFrom200WMA <= 0) score += 25;        // at or below
    else if (pctFrom200WMA <= 5) score += 15;    // within 5% above
    else if (pctFrom200WMA <= 15) score += 5;    // within 15% above
  }

  // Price vs 200 MMA (max 25pts)
  if (pctFrom200MMA != null) {
    if (pctFrom200MMA <= 0) score += 25;         // at or below
    else if (pctFrom200MMA <= 5) score += 15;    // within 5% above
    else if (pctFrom200MMA <= 10) score += 5;    // within 10% above
  }

  return score;
}

/**
 * Determine signal from total score
 */
export function getSignal(totalScore) {
  if (totalScore >= 75) return 'LOAD THE BOAT';
  if (totalScore >= 60) return 'ACCUMULATE';
  return 'WATCH';
}

/**
 * Run full TLI scoring for a single ticker's data
 */
export function scoreTicker(data) {
  const { currentPrice, week52High, price200WMA, price200MMA, revenueGrowthPct, psRatio, peRatio } = data;

  const pctFrom52wHigh = week52High && currentPrice
    ? ((currentPrice - week52High) / week52High) * 100
    : null;

  const pctFrom200WMA = price200WMA && currentPrice
    ? ((currentPrice - price200WMA) / price200WMA) * 100
    : null;

  const pctFrom200MMA = price200MMA && currentPrice
    ? ((currentPrice - price200MMA) / price200MMA) * 100
    : null;

  const fundamentalScore = calculateFundamentalScore({
    revenueGrowthPct,
    psRatio,
    peRatio,
    pctFrom52wHigh,
  });

  const technicalScore = calculateTechnicalScore({
    pctFrom200WMA,
    pctFrom200MMA,
  });

  const totalScore = fundamentalScore + technicalScore;
  const signal = getSignal(totalScore);

  return {
    pctFrom52wHigh: pctFrom52wHigh ? Math.round(pctFrom52wHigh * 100) / 100 : null,
    pctFrom200WMA: pctFrom200WMA ? Math.round(pctFrom200WMA * 100) / 100 : null,
    pctFrom200MMA: pctFrom200MMA ? Math.round(pctFrom200MMA * 100) / 100 : null,
    fundamentalScore,
    technicalScore,
    totalScore,
    signal,
  };
}
