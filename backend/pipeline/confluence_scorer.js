/**
 * Confluence Scoring — 0-40pts (Sprint 10A, Task 7)
 *
 * The biggest scoring component. Scores how many support
 * signals align at the current price level.
 */

function scoreConfluence(stock, waveAnalysis) {
  let score = 0;
  const supports = [];

  const price = stock.currentPrice;
  if (price == null || price <= 0) {
    return { score: 0, supports: [], supportCount: 0, badge: null };
  }

  const tolerance = 0.03; // 3% proximity

  function near(level) {
    if (level == null || level <= 0) return false;
    return Math.abs(price - level) / level <= tolerance;
  }

  // ── Support Stack ──

  // Previous low
  if (near(stock.previousLow)) {
    score += 3; supports.push('PREVIOUS_LOW');
  }

  // Round numbers
  const roundLevels = [10, 25, 50, 75, 100, 150, 200, 250, 300, 500];
  if (roundLevels.some(r => Math.abs(price - r) / r < 0.02)) {
    score += 2; supports.push('ROUND_NUMBER');
  }

  // 50-day MA
  if (near(stock.sma50 || stock.ma50d)) {
    score += 3; supports.push('50_DAY_MA');
  }

  // 200-day MA
  if (near(stock.sma200 || stock.ma200d)) {
    score += 4; supports.push('200_DAY_MA');
  }

  // 200 Weekly MA
  if (near(stock.wma200 || stock.price200WMA)) {
    score += 5; supports.push('200_WEEK_MA');
  }

  // ── Fibonacci levels from wave analysis ──
  if (waveAnalysis) {
    const levels = waveAnalysis.key_levels || {};

    if (near(levels.fib_0382)) {
      score += 3; supports.push('FIB_0382');
    }
    if (near(levels.fib_050)) {
      score += 4; supports.push('FIB_050');
    }
    if (near(levels.fib_0618)) {
      score += 5; supports.push('FIB_0618');
    }
    if (near(levels.fib_0786)) {
      score += 4; supports.push('FIB_0786');
    }
    if (near(levels.wave1_origin)) {
      score += 5; supports.push('WAVE_1_ORIGIN');
    }
  }

  // ── Special Confluence Bonuses ──
  let badge = null;

  // CONFLUENCE ZONE: 200WMA + 0.618 Fib within 3%
  const wma = stock.wma200 || stock.price200WMA;
  const fib618 = waveAnalysis?.key_levels?.fib_0618;
  if (wma != null && fib618 != null) {
    if (Math.abs(wma - fib618) / fib618 < 0.03 && near(wma)) {
      score += 15;
      badge = 'CONFLUENCE_ZONE';
      supports.push('CONFLUENCE_ZONE');
    }
  }

  // GENERATIONAL SUPPORT: 0.786 + Wave 1 origin + 200MMA within 15%
  const f786 = waveAnalysis?.key_levels?.fib_0786;
  const w1 = waveAnalysis?.key_levels?.wave1_origin;
  const mma = stock.mma200 || stock.price200MMA;
  if (f786 != null && w1 != null && mma != null) {
    const values = [f786, w1, mma];
    const spread = Math.max(...values) - Math.min(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    if (spread / avg < 0.15 && near(avg)) {
      score += 20;
      badge = 'GENERATIONAL_BUY';
      supports.push('GENERATIONAL_BUY');
    }
  }

  // ── Confirmation Types ──
  if (stock.vBounceDetected === true) {
    score += 5; supports.push('V_BOUNCE_CONFIRMED');
  }
  if (stock.baseBuildDetected === true) {
    score += 5; supports.push('BASE_BUILD_CONFIRMED');
  }

  // ── Secondary Confirmations ──
  if (stock.volumeIncreasingOnBounce === true) { score += 2; supports.push('BULLISH_VOLUME'); }
  if (stock.bullishCandlestickAtSupport === true) { score += 2; supports.push('BULLISH_CANDLE'); }
  if (stock.rsiBullishDivergence === true) { score += 2; supports.push('RSI_DIVERGENCE'); }
  if (stock.macdBullishDivergence === true) { score += 2; supports.push('MACD_DIVERGENCE'); }

  return {
    score: Math.min(score, 40), // Cap at 40
    supports,
    supportCount: supports.length,
    badge,
  };
}

module.exports = { scoreConfluence };
