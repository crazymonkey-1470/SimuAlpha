/**
 * Financial Health Check — Stage 2.7 (Sprint 10A, Task 4)
 *
 * 12 metrics scored relative to sector medians.
 * Starts at max score (12), subtracts for each red flag detected.
 */

const SECTOR_MEDIANS = {
  'Information Technology': { pe: 28, de: 0.5, currentRatio: 2.5, roe: 18, profitMargin: 20 },
  'Health Care': { pe: 22, de: 0.8, currentRatio: 2.0, roe: 15, profitMargin: 15 },
  'Financials': { pe: 12, de: 3.0, currentRatio: 1.2, roe: 12, profitMargin: 25 },
  'Consumer Discretionary': { pe: 20, de: 0.8, currentRatio: 1.5, roe: 15, profitMargin: 10 },
  'Consumer Staples': { pe: 22, de: 0.7, currentRatio: 1.0, roe: 20, profitMargin: 12 },
  'Energy': { pe: 10, de: 0.5, currentRatio: 1.2, roe: 12, profitMargin: 10 },
  'Industrials': { pe: 18, de: 0.8, currentRatio: 1.5, roe: 15, profitMargin: 10 },
  'Materials': { pe: 15, de: 0.6, currentRatio: 1.8, roe: 12, profitMargin: 10 },
  'Communication Services': { pe: 20, de: 0.7, currentRatio: 1.5, roe: 15, profitMargin: 15 },
  'Utilities': { pe: 16, de: 1.5, currentRatio: 0.8, roe: 10, profitMargin: 12 },
  'Real Estate': { pe: 25, de: 1.2, currentRatio: 1.0, roe: 8, profitMargin: 20 },
};

function healthCheck(stock) {
  const medians = SECTOR_MEDIANS[stock.sector] || SECTOR_MEDIANS['Industrials'];
  const redFlags = [];
  let healthScore = 12; // Start at max, subtract for each red flag

  // 1. P/E vs sector (HIGH weight)
  if (stock.peRatio != null && (stock.peRatio > medians.pe * 1.5 || stock.peRatio < 0)) {
    redFlags.push('PE_ELEVATED'); healthScore -= 2;
  }

  // 2. D/E vs sector (HIGH weight)
  const deThreshold = stock.sector === 'Financials' ? 3.0
    : (stock.sector === 'Utilities' ? 2.0 : 1.0);
  if (stock.debtToEquity != null && stock.debtToEquity > deThreshold
      && (stock.fcfMargin == null || stock.fcfMargin < 10)) {
    redFlags.push('DEBT_ELEVATED_WEAK_FCF'); healthScore -= 2;
  }

  // 3. Current Ratio (MEDIUM weight)
  if (stock.currentRatio != null && stock.currentRatio < 1.0) {
    redFlags.push('LIQUIDITY_RISK'); healthScore -= 1;
  }
  if (stock.currentRatio != null && stock.currentRatio > 4.0) {
    redFlags.push('CAPITAL_INEFFICIENT'); healthScore -= 1;
  }

  // 4. Revenue Growth consistency (HIGH weight)
  if (stock.revenueGrowthErratic === true) {
    redFlags.push('REVENUE_ERRATIC'); healthScore -= 2;
  }

  // 5. EPS Growth in tandem with revenue (HIGH weight)
  if (stock.epsGrowthYoY != null && stock.epsGrowthYoY > 10
      && stock.revenueGrowthYoY != null && stock.revenueGrowthYoY < 0) {
    redFlags.push('EPS_WITHOUT_REVENUE'); healthScore -= 2;
  }

  // 6. ROE (MEDIUM weight)
  if (stock.returnOnEquity != null && stock.returnOnEquity < 10) {
    redFlags.push('ROE_LOW'); healthScore -= 1;
  }

  // 7. Dividend Payout Ratio (LOW-MEDIUM weight)
  if (stock.dividendPayoutRatio != null && stock.dividendPayoutRatio > 80) {
    redFlags.push('DIVIDEND_UNSUSTAINABLE'); healthScore -= 1;
  }

  // 8. Free Cash Flow (HIGHEST weight)
  if (stock.freeCashFlow != null && stock.freeCashFlow < 0) {
    redFlags.push('FCF_NEGATIVE'); healthScore -= 3;
  } else if (stock.fcfGrowthYoY != null && stock.fcfGrowthYoY < -10) {
    redFlags.push('FCF_DECLINING'); healthScore -= 2;
  }

  // 9. FCF per Share Trend (HIGH weight)
  if (stock.fcfPerShare != null && stock.epsDiluted != null) {
    if (stock.fcfPerShare < stock.epsDiluted * 0.5) {
      redFlags.push('FCF_EPS_DIVERGENCE'); healthScore -= 2;
    }
  }

  // 10. Inventory/Revenue growth mismatch (MEDIUM weight)
  if (stock.inventoryGrowth != null && stock.revenueGrowthYoY != null
      && stock.inventoryGrowth > stock.revenueGrowthYoY * 1.5) {
    redFlags.push('INVENTORY_BUILDUP'); healthScore -= 1;
  }

  // 11. Insider Activity (MEDIUM weight)
  if (stock.insiderNetBuying === false) {
    redFlags.push('INSIDER_SELLING'); healthScore -= 1;
  }

  // 12. EPS-Revenue Coherence (manipulation check)
  if (stock.epsGrowthYoY != null && stock.epsGrowthYoY > 5
      && stock.revenueGrowthYoY != null && stock.revenueGrowthYoY < -2) {
    redFlags.push('MANIPULATION_SUSPECTED'); healthScore -= 2;
  }

  return {
    healthScore: Math.max(0, healthScore),
    maxScore: 12,
    redFlags,
    redFlagCount: redFlags.length,
    sectorMedians: medians,
  };
}

module.exports = { healthCheck, SECTOR_MEDIANS };
