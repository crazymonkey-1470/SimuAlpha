/**
 * Fundamental Gate — Hard Pass/Fail (Sprint 10A, Task 1)
 *
 * Every stock must pass ALL five checks before any scoring begins.
 * Fail any one = DISQUALIFIED, no further scoring.
 */

function fundamentalGate(stock) {
  const failures = [];

  // Gate 1: Revenue must be growing
  // At least one of 3yr avg or YoY must be positive
  if ((stock.revenueGrowth3YrAvg != null && stock.revenueGrowth3YrAvg <= 0)
      && (stock.revenueGrowthYoY != null && stock.revenueGrowthYoY <= 0)) {
    failures.push('REVENUE_DECLINING');
  }

  // Gate 2: Gross margin not contracting (>5% decline = fail)
  if (stock.grossMarginCurrent != null && stock.grossMarginPriorYear != null
      && stock.grossMarginCurrent < stock.grossMarginPriorYear * 0.95) {
    failures.push('GROSS_MARGIN_CONTRACTING');
  }

  // Gate 3: Can service debt
  // Debt service ratio proxy: EBITDA / (10% of total debt as annual service estimate)
  if (stock.ttmEBITDA != null && stock.totalDebt != null && stock.totalDebt > 0) {
    const annualDebtService = Math.max(stock.totalDebt * 0.1, 1);
    const debtServiceRatio = stock.ttmEBITDA / annualDebtService;
    if (debtServiceRatio < 1.5) {
      failures.push('DEBT_SERVICE_WEAK');
    }
  }

  // Gate 4: Guidance not lowered
  // Proxy: if last 2 quarters EPS both declined >10%, flag as guidance concern
  if (stock.epsGrowthQoQ != null && stock.epsGrowthQoQ < -10
      && stock.epsGrowthPriorQoQ != null && stock.epsGrowthPriorQoQ < -10) {
    failures.push('GUIDANCE_DETERIORATING');
  }

  // Gate 5: No heavy insider selling
  // Shares outstanding increasing >2% YoY (dilution) AND insider net selling
  if (stock.sharesOutstandingChange != null && stock.sharesOutstandingChange > 0.02
      && stock.insiderNetBuying === false) {
    failures.push('INSIDER_SELLING_HEAVY');
  }

  return {
    passes: failures.length === 0,
    failures,
    disqualified: failures.length > 0,
  };
}

module.exports = { fundamentalGate };
