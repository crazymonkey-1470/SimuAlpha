/**
 * Lynch Screen — Stage 2.5 (Sprint 10A, Task 2)
 *
 * 7-point screen based on Peter Lynch methodology.
 * Score 0-7, passes at >= 5.
 * Perfect score (7/7) earns LYNCH_PERFECT_SCORE badge.
 */

function lynchScreen(stock) {
  let score = 0;
  const passes = [];
  const fails = [];

  // 1. Trailing P/E < 25
  if (stock.peRatio != null && stock.peRatio > 0 && stock.peRatio < 25) {
    score++; passes.push('PE_TRAILING');
  } else { fails.push('PE_TRAILING'); }

  // 2. Forward P/E < 15
  if (stock.forwardPE != null && stock.forwardPE > 0 && stock.forwardPE < 15) {
    score++; passes.push('PE_FORWARD');
  } else { fails.push('PE_FORWARD'); }

  // 3. Debt/Equity < 35%
  if (stock.debtToEquity != null && stock.debtToEquity < 0.35) {
    score++; passes.push('DEBT_EQUITY');
  } else { fails.push('DEBT_EQUITY'); }

  // 4. EPS Growth > 15% YoY
  if (stock.epsGrowthYoY != null && stock.epsGrowthYoY > 15) {
    score++; passes.push('EPS_GROWTH');
  } else { fails.push('EPS_GROWTH'); }

  // 5. PEG Ratio < 1.2
  const peg = computePEG(stock);
  if (peg != null && peg > 0 && peg < 1.2) {
    score++; passes.push('PEG_RATIO');
  } else { fails.push('PEG_RATIO'); }

  // 6. Market Cap > $5B
  if (stock.marketCap != null && stock.marketCap > 5e9) {
    score++; passes.push('MARKET_CAP');
  } else { fails.push('MARKET_CAP'); }

  // 7. Insider Activity = Net Buying
  if (stock.insiderNetBuying === true) {
    score++; passes.push('INSIDER_BUYING');
  } else { fails.push('INSIDER_BUYING'); }

  return {
    score,
    maxScore: 7,
    passes,
    fails,
    badge: score === 7 ? 'LYNCH_PERFECT_SCORE' : null,
    passesScreen: score >= 5,
  };
}

function computePEG(stock) {
  if (!stock.peRatio || stock.peRatio <= 0) return null;
  if (!stock.epsGrowthYoY || stock.epsGrowthYoY <= 0) return null;
  return stock.peRatio / stock.epsGrowthYoY;
}

module.exports = { lynchScreen, computePEG };
