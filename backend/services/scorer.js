/**
 * TLI Scoring Algorithm — The Long Investor methodology
 *
 * FUNDAMENTAL (50 pts) + TECHNICAL (50 pts) = TOTAL (0–100)
 * If any input is null, that component scores 0 (skipped gracefully).
 * Never returns NaN.
 */

function scoreFundamental({ revenueGrowthPct, pctFrom52wHigh, psRatio, peRatio }) {
  let score = 0;

  // Revenue YoY growth (max 15 pts)
  if (revenueGrowthPct != null && isFinite(revenueGrowthPct)) {
    if (revenueGrowthPct >= 20) score += 15;
    else if (revenueGrowthPct >= 10) score += 10;
    else if (revenueGrowthPct > 0) score += 5;
  }

  // Price vs 52-week high — how beaten down (max 15 pts)
  if (pctFrom52wHigh != null && isFinite(pctFrom52wHigh)) {
    const pctBelow = Math.abs(pctFrom52wHigh);
    if (pctBelow >= 60) score += 15;
    else if (pctBelow >= 40) score += 12;
    else if (pctBelow >= 25) score += 8;
    else if (pctBelow >= 15) score += 4;
  }

  // P/S ratio (max 10 pts)
  if (psRatio != null && isFinite(psRatio) && psRatio > 0) {
    if (psRatio < 1) score += 10;
    else if (psRatio < 3) score += 7;
    else if (psRatio < 5) score += 4;
    else if (psRatio < 10) score += 2;
  }

  // P/E ratio (max 10 pts)
  if (peRatio != null && isFinite(peRatio) && peRatio > 0) {
    if (peRatio < 10) score += 10;
    else if (peRatio < 15) score += 7;
    else if (peRatio < 20) score += 4;
    else if (peRatio < 30) score += 2;
  }

  return score;
}

function scoreTechnical({ pctFrom200WMA, pctFrom200MMA }) {
  let score = 0;

  // Price vs 200 WMA (max 25 pts)
  if (pctFrom200WMA != null && isFinite(pctFrom200WMA)) {
    if (pctFrom200WMA <= 0) score += 25;
    else if (pctFrom200WMA <= 3) score += 20;
    else if (pctFrom200WMA <= 8) score += 12;
    else if (pctFrom200WMA <= 15) score += 5;
  }

  // Price vs 200 MMA (max 25 pts)
  if (pctFrom200MMA != null && isFinite(pctFrom200MMA)) {
    if (pctFrom200MMA <= 0) score += 25;
    else if (pctFrom200MMA <= 3) score += 20;
    else if (pctFrom200MMA <= 8) score += 12;
    else if (pctFrom200MMA <= 10) score += 5;
  }

  return score;
}

function getSignal(totalScore) {
  if (totalScore >= 75) return 'LOAD THE BOAT';
  if (totalScore >= 60) return 'ACCUMULATE';
  if (totalScore >= 40) return 'WATCH';
  return 'PASS';
}

function getEntryZone({ currentPrice, price200WMA, price200MMA, pctFrom200WMA, pctFrom200MMA }) {
  const belowWMA = pctFrom200WMA != null && pctFrom200WMA <= 0;
  const belowMMA = pctFrom200MMA != null && pctFrom200MMA <= 0;
  // "Near" means within 3% ABOVE the MA (approaching from above) — not below (already in zone)
  const nearWMA = pctFrom200WMA != null && pctFrom200WMA > 0 && pctFrom200WMA <= 3;
  const nearMMA = pctFrom200MMA != null && pctFrom200MMA > 0 && pctFrom200MMA <= 3;
  const within8WMA = pctFrom200WMA != null && pctFrom200WMA <= 8;
  const within8MMA = pctFrom200MMA != null && pctFrom200MMA <= 8;

  let entryZone = false;
  let entryNote = '';

  if (belowWMA && belowMMA) {
    entryZone = true;
    entryNote = `Price $${f(currentPrice)} is below BOTH 200WMA ($${f(price200WMA)}) and 200MMA ($${f(price200MMA)}) — best entry zone`;
  } else if (belowWMA || belowMMA) {
    entryZone = true;
    const which = belowWMA ? '200WMA' : '200MMA';
    const ma = belowWMA ? price200WMA : price200MMA;
    entryNote = `Price $${f(currentPrice)} is below ${which} ($${f(ma)}) — good entry zone`;
  } else if (nearWMA || nearMMA) {
    entryZone = true;
    entryNote = `Price $${f(currentPrice)} is within 3% of ${nearWMA ? '200WMA' : '200MMA'} — entry zone approaching`;
  } else if (within8WMA || within8MMA) {
    entryZone = false;
    const pctAbove = pctFrom200WMA != null && pctFrom200MMA != null
      ? Math.min(pctFrom200WMA, pctFrom200MMA)
      : (pctFrom200WMA ?? pctFrom200MMA ?? 0);
    const target = price200WMA != null ? price200WMA : price200MMA;
    entryNote = `Price $${f(currentPrice)} is ${f(pctAbove, 1)}% above MA — wait for pullback to $${f(target)}`;
  } else {
    entryZone = false;
    entryNote = `Price $${f(currentPrice)} is above both MAs — wait for pullback`;
  }

  return { entryZone, entryNote };
}

function f(val, dec = 2) {
  if (val == null || !isFinite(val)) return '—';
  return Number(val).toFixed(dec);
}

function runScorer({ currentPrice, week52High, week52Low, price200WMA, price200MMA, revenueGrowthPct, psRatio, peRatio, ...opts }) {
  const pctFrom52wHigh = (week52High != null && currentPrice != null && week52High > 0)
    ? ((currentPrice - week52High) / week52High) * 100
    : null;

  const pctFrom200WMA = (price200WMA != null && currentPrice != null && price200WMA > 0)
    ? ((currentPrice - price200WMA) / price200WMA) * 100
    : null;

  const pctFrom200MMA = (price200MMA != null && currentPrice != null && price200MMA > 0)
    ? ((currentPrice - price200MMA) / price200MMA) * 100
    : null;

  const fundamentalScore = scoreFundamental({ revenueGrowthPct, pctFrom52wHigh, psRatio, peRatio });
  const technicalScore = scoreTechnical({ pctFrom200WMA, pctFrom200MMA });
  let totalScore = fundamentalScore + technicalScore;

  // Confluence zone: 200WMA and 0.618 Fib retracement converge at the same price
  let confluenceZone = false;
  let confluenceNote = '';

  if (week52High != null && week52Low != null && price200WMA != null && currentPrice != null) {
    const range = week52High - week52Low;
    if (range > 0) {
      const fib618Level = week52High - 0.618 * range;
      const wmaFibDiff = Math.abs(price200WMA - fib618Level) / fib618Level;

      // 200WMA and 0.618 Fib within 5% of each other = confluence
      if (wmaFibDiff <= 0.05) {
        const confluenceLevel = (price200WMA + fib618Level) / 2;
        // Price is at or below the confluence level (within 3% above)
        if (currentPrice <= confluenceLevel * 1.03) {
          confluenceZone = true;
          totalScore += 15;
          confluenceNote = `CONFLUENCE ZONE: 200WMA ($${f(price200WMA)}) and 0.618 Fib ($${f(fib618Level)}) converge at the same price level. Price $${f(currentPrice)} is at this zone — highest conviction TLI setup.`;
        }
      }
    }
  }

  // ── PART 8: Additional scoring components (additive bonuses) ──
  let bonusNotes = [];

  // 50-day MA as Wave 2 confirmation (+5pts)
  if (opts.ma50d != null && opts.waveSignal === 'WAVE_2_BOTTOM') {
    const pctFromMa50 = currentPrice != null && opts.ma50d > 0
      ? Math.abs((currentPrice - opts.ma50d) / opts.ma50d) * 100 : null;
    if (pctFromMa50 != null && pctFromMa50 <= 5) {
      totalScore += 5;
      bonusNotes.push('50-day MA acting as Wave 2 support — confirms wave position is intact.');
    }
  }

  // Golden Cross (+5pts) / Death Cross (-5pts)
  if (opts.goldenCross) {
    totalScore += 5;
    bonusNotes.push('Golden Cross detected — 50-day MA crossed above 200-day MA.');
  }
  if (opts.deathCross) {
    totalScore -= 5;
    bonusNotes.push('Death Cross detected — 50-day MA crossed below 200-day MA.');
  }

  // Higher Highs / Higher Lows pattern (+5pts)
  if (opts.hhHlPattern) {
    totalScore += 5;
    bonusNotes.push('Higher highs and higher lows confirmed — uptrend forming.');
  }

  // Earnings approaching penalty (-15pts)
  if (opts.earningsWithin14Days) {
    totalScore -= 15;
    bonusNotes.push(`EARNINGS IN ${opts.earningsDaysAway || '?'} DAYS — confluence levels may not hold through earnings. Consider waiting for the report before entering a full position.`);
  }

  // Fundamental deterioration override
  let fundamentalDeterioration = false;
  if (opts.previousScore != null && opts.previousScore > 60 && revenueGrowthPct != null && revenueGrowthPct < 0) {
    fundamentalDeterioration = true;
    bonusNotes.push('THESIS BROKEN — revenue growth has turned negative. Exit the position regardless of wave count.');
  }

  // ── PART 6: Generational Buy detection ──
  let generationalBuy = false;
  if (opts.wave1Origin != null && price200MMA != null && currentPrice != null) {
    // Check if 0.786 Fib, Wave 1 origin, and 200MMA all converge within 15% of price
    const fib786 = opts.fib786Level; // Passed from wave analysis
    const levels = [fib786, opts.wave1Origin, price200MMA].filter(v => v != null);
    if (levels.length >= 3) {
      const allWithin15 = levels.every(l => Math.abs((l - currentPrice) / currentPrice) <= 0.15);
      if (allWithin15) {
        generationalBuy = true;
        totalScore += 25;
        bonusNotes.push(`GENERATIONAL BUY — three major support structures converging: 0.786 Fib ($${f(fib786)}), Wave 1 origin ($${f(opts.wave1Origin)}), and 200MMA ($${f(price200MMA)}). This is a once-in-a-decade setup.`);
      }
    }
  }

  // Cap score at 0-100
  totalScore = Math.max(0, Math.min(100, totalScore));

  const signal = generationalBuy ? 'GENERATIONAL_BUY'
    : fundamentalDeterioration ? 'FUNDAMENTAL_DETERIORATION'
    : getSignal(totalScore);

  const { entryZone, entryNote } = getEntryZone({
    currentPrice,
    price200WMA,
    price200MMA,
    pctFrom200WMA,
    pctFrom200MMA,
  });

  // Return to 200WMA calculation
  const returnTo200wmaPct = (price200WMA != null && currentPrice != null && currentPrice > 0 && price200WMA > currentPrice)
    ? safe(((price200WMA - currentPrice) / currentPrice) * 100, 1)
    : null;

  return {
    pctFrom52wHigh: safe(pctFrom52wHigh, 1),
    pctFrom200WMA: safe(pctFrom200WMA, 1),
    pctFrom200MMA: safe(pctFrom200MMA, 1),
    fundamentalScore,
    technicalScore,
    totalScore,
    signal,
    entryZone,
    entryNote,
    confluenceZone,
    confluenceNote,
    generationalBuy,
    fundamentalDeterioration,
    returnTo200wmaPct,
    bonusNotes,
  };
}

function safe(val, dec = 1) {
  if (val == null || !isFinite(val)) return null;
  return Math.round(val * Math.pow(10, dec)) / Math.pow(10, dec);
}

module.exports = { runScorer, getSignal, scoreFundamental, scoreTechnical };
