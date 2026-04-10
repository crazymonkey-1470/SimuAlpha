/**
 * Buffett Screen — Stage 2.6 (Sprint 10A, Task 3)
 *
 * 9-point screen based on Warren Buffett methodology.
 * Score 0-9, passes at >= 6.
 */

function buffettScreen(stock) {
  let score = 0;
  const passes = [];
  const fails = [];

  // 1. Trailing P/E < 15
  if (stock.peRatio != null && stock.peRatio > 0 && stock.peRatio < 15) {
    score++; passes.push('PE_TRAILING_STRICT');
  } else { fails.push('PE_TRAILING_STRICT'); }

  // 2. Forward P/E < 15
  if (stock.forwardPE != null && stock.forwardPE > 0 && stock.forwardPE < 15) {
    score++; passes.push('PE_FORWARD_STRICT');
  } else { fails.push('PE_FORWARD_STRICT'); }

  // 3. Price/FCF < 10
  if (stock.freeCashFlow != null && stock.freeCashFlow > 0 && stock.marketCap != null) {
    const priceFCF = stock.marketCap / stock.freeCashFlow;
    if (priceFCF < 10) {
      score++; passes.push('PRICE_FCF');
    } else { fails.push('PRICE_FCF'); }
  } else { fails.push('PRICE_FCF'); }

  // 4. Profit Margin > 15%
  if (stock.operatingMargin != null && stock.operatingMargin > 15) {
    score++; passes.push('PROFIT_MARGIN');
  } else { fails.push('PROFIT_MARGIN'); }

  // 5. ROI > 10%
  if (stock.returnOnInvestment != null && stock.returnOnInvestment > 10) {
    score++; passes.push('ROI');
  } else { fails.push('ROI'); }

  // 6. Profitable (Net Income > 0)
  if (stock.netIncome != null && stock.netIncome > 0) {
    score++; passes.push('PROFITABLE');
  } else { fails.push('PROFITABLE'); }

  // 7. Pays Dividend
  if (stock.dividendYield != null && stock.dividendYield > 0) {
    score++; passes.push('DIVIDEND');
  } else { fails.push('DIVIDEND'); }

  // 8. 5-Year EPS Growth > 20%
  if (stock.epsGrowth5Yr != null && stock.epsGrowth5Yr > 20) {
    score++; passes.push('EPS_5YR_GROWTH');
  } else { fails.push('EPS_5YR_GROWTH'); }

  // 9. Competent Management
  // Proxy: insider ownership >5% OR consistent buybacks
  if ((stock.insiderOwnership != null && stock.insiderOwnership > 5)
      || (stock.sharesOutstandingChange != null && stock.sharesOutstandingChange < -0.01)) {
    score++; passes.push('MANAGEMENT');
  } else { fails.push('MANAGEMENT'); }

  return {
    score,
    maxScore: 9,
    passes,
    fails,
    passesScreen: score >= 6,
  };
}

module.exports = { buffettScreen };
