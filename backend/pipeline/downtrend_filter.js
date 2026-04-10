/**
 * Downtrend Detection Filter (Sprint 10A, Task 5)
 *
 * Score 0-8. If score >= 4, suppress ALL buy signals
 * except GENERATIONAL_SUPPORT_ZONE.
 */

function downtrendFilter(stock) {
  let score = 0;
  const signals = [];

  // 1. Lower Highs + Lower Lows (from weekly data)
  if (stock.hasLowerHighsLowerLows === true) {
    score++; signals.push('LH_LL_PATTERN');
  }

  // 2. Breaking through successive Fib supports
  if (stock.breakingFibSupports === true) {
    score++; signals.push('FIB_BREAKDOWN');
  }

  // 3. Prior supports failing (break, retest, reject)
  if (stock.supportsFailing === true) {
    score++; signals.push('SUPPORT_FAILURE');
  }

  // 4. Price in downward channel
  if (stock.inDownwardChannel === true) {
    score++; signals.push('DOWN_CHANNEL');
  }

  // 5. Bear flag patterns
  if (stock.hasBearFlag === true) {
    score++; signals.push('BEAR_FLAG');
  }

  // 6. Volume increasing on sell-offs, declining on bounces
  if (stock.bearishVolumeProfile === true) {
    score++; signals.push('BEARISH_VOLUME');
  }

  // 7. Price below BOTH 50-day AND 200-day MA, both sloping down
  if (stock.currentPrice != null && stock.sma50 != null && stock.sma200 != null
      && stock.currentPrice < stock.sma50 && stock.currentPrice < stock.sma200
      && stock.sma50SlopeNegative === true && stock.sma200SlopeNegative === true) {
    score++; signals.push('BELOW_BOTH_MA');
  }

  // 8. Death cross (50-day crosses below 200-day)
  if (stock.deathCrossActive === true) {
    score++; signals.push('DEATH_CROSS');
  }

  return {
    score,
    signals,
    suppressBuySignals: score >= 4,
    potentialWave1Forming: score < 4 && stock.downtrendScoreDecreasing === true,
  };
}

module.exports = { downtrendFilter };
