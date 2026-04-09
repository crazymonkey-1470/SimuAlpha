/**
 * Data Enrichment Service — Sprint 7
 *
 * Computes derived fields that Polygon doesn't provide directly:
 *   - Beta (52-week returns vs SPY, Cov/Var method)
 *   - Forward P/E (trailing EPS + growth rate)
 *   - GAAP/Non-GAAP divergence (operating income vs net income gap)
 *   - Historical EV/Sales & EV/EBITDA (5yr avg from financials + price)
 */

const { fetchHistoricalPrices } = require('./fetcher');

// ═══════════════════════════════════════════
// SPY CACHE (fetched once per pipeline run)
// ═══════════════════════════════════════════

let _spyWeeklyReturns = null;
let _spyCacheTimestamp = 0;
const SPY_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

async function getSpyReturns() {
  const now = Date.now();
  if (_spyWeeklyReturns && (now - _spyCacheTimestamp) < SPY_CACHE_TTL) {
    return _spyWeeklyReturns;
  }

  console.log('[Enrichment] Fetching SPY weekly data for beta calculation...');
  const spy = await fetchHistoricalPrices('SPY');
  if (!spy || !spy.weeklyCloses || spy.weeklyCloses.length < 52) {
    console.error('[Enrichment] Insufficient SPY data for beta calculation');
    return null;
  }

  // Use last 52 weekly closes to compute returns
  const closes = spy.weeklyCloses.slice(-53); // 53 prices = 52 returns
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
  }

  _spyWeeklyReturns = returns;
  _spyCacheTimestamp = now;
  console.log(`[Enrichment] SPY returns cached: ${returns.length} weekly returns`);
  return returns;
}

// ═══════════════════════════════════════════
// BETA CALCULATION (Cov/Var method)
// ═══════════════════════════════════════════

/**
 * Compute beta from weekly returns vs SPY.
 * Beta = Cov(stock, SPY) / Var(SPY)
 */
function computeBeta(stockWeeklyCloses) {
  if (!_spyWeeklyReturns || _spyWeeklyReturns.length < 20) return null;
  if (!stockWeeklyCloses || stockWeeklyCloses.length < 53) return null;

  // Compute stock returns (last 52 weeks = 53 prices)
  const closes = stockWeeklyCloses.slice(-53);
  const stockReturns = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) {
      stockReturns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
  }

  // Align lengths (use min of both)
  const len = Math.min(stockReturns.length, _spyWeeklyReturns.length);
  if (len < 20) return null;

  const sr = stockReturns.slice(-len);
  const mr = _spyWeeklyReturns.slice(-len);

  // Mean returns
  const meanStock = sr.reduce((a, b) => a + b, 0) / len;
  const meanMarket = mr.reduce((a, b) => a + b, 0) / len;

  // Covariance and variance
  let cov = 0;
  let varMarket = 0;
  for (let i = 0; i < len; i++) {
    const dStock = sr[i] - meanStock;
    const dMarket = mr[i] - meanMarket;
    cov += dStock * dMarket;
    varMarket += dMarket * dMarket;
  }

  if (varMarket === 0) return null;

  const beta = cov / varMarket;
  return Math.round(beta * 1000) / 1000; // 3 decimal places
}

// ═══════════════════════════════════════════
// FORWARD P/E APPROXIMATION
// ═══════════════════════════════════════════

/**
 * Forward P/E = current_price / (trailing EPS * (1 + growth_rate))
 * Uses revenue growth 3yr as growth proxy, capped at 30%.
 */
function computeForwardPE(currentPrice, epsDiluted, revenueGrowth3Yr) {
  if (!currentPrice || currentPrice <= 0) return null;
  if (!epsDiluted || epsDiluted <= 0) return null;

  // Use 3yr revenue growth as earnings growth proxy, capped conservatively
  const growthRate = revenueGrowth3Yr != null
    ? Math.min(Math.max(revenueGrowth3Yr, -20), 30) / 100
    : 0.05; // default 5% if unknown

  const forwardEPS = epsDiluted * (1 + growthRate);
  if (forwardEPS <= 0) return null;

  return Math.round(currentPrice / forwardEPS * 100) / 100;
}

// ═══════════════════════════════════════════
// GAAP / NON-GAAP DIVERGENCE
// ═══════════════════════════════════════════

/**
 * GAAP/Non-GAAP divergence approximation.
 * Measures the gap between operating income and net income as % of revenue.
 * Large divergence = aggressive non-GAAP adjustments = lower earnings quality.
 */
function computeGaapDivergence(operatingIncome, netIncome, revenueCurrent) {
  if (!operatingIncome || !netIncome || !revenueCurrent || revenueCurrent <= 0) return null;

  // Divergence = |operating_income - net_income| / revenue * 100
  const divergence = Math.abs(operatingIncome - netIncome) / Math.abs(revenueCurrent) * 100;
  return Math.round(divergence * 100) / 100;
}

// ═══════════════════════════════════════════
// HISTORICAL EV MULTIPLES (5-year average)
// ═══════════════════════════════════════════

/**
 * Compute historical EV/Sales and EV/EBITDA from revenue/EBITDA history + price history.
 * Uses annual snapshots: for each year's revenue, approximate market cap from monthly close,
 * add net debt to get EV, then compute the multiple.
 */
function computeHistoricalEVMultiples(revenueHistory, monthlyCloses, totalDebt, cashAndEquivalents, sharesOutstanding) {
  if (!revenueHistory || revenueHistory.length < 2) return { evSales5YrAvg: null, evEbitda5YrAvg: null };
  if (!monthlyCloses || monthlyCloses.length < 12) return { evSales5YrAvg: null, evEbitda5YrAvg: null };
  if (!sharesOutstanding || sharesOutstanding <= 0) return { evSales5YrAvg: null, evEbitda5YrAvg: null };

  const netDebt = (totalDebt || 0) - (cashAndEquivalents || 0);

  // Revenue history is oldest-first, up to 5 years
  // Monthly closes are oldest-first
  // For each year of revenue, pick a representative monthly close
  const validRevs = revenueHistory.filter(r => r != null && r > 0);
  if (validRevs.length < 2) return { evSales5YrAvg: null, evEbitda5YrAvg: null };

  const evSalesMultiples = [];

  // Use up to 5 years of data
  const yearsToUse = Math.min(validRevs.length, 5);
  for (let i = 0; i < yearsToUse; i++) {
    const rev = revenueHistory[revenueHistory.length - 1 - i];
    if (!rev || rev <= 0) continue;

    // Pick monthly close from approximately i years ago (12 months per year)
    const monthIdx = monthlyCloses.length - 1 - (i * 12);
    if (monthIdx < 0 || monthIdx >= monthlyCloses.length) continue;

    const price = monthlyCloses[monthIdx];
    if (!price || price <= 0) continue;

    const marketCap = price * sharesOutstanding;
    const ev = marketCap + netDebt;
    if (ev <= 0) continue;

    evSalesMultiples.push(ev / rev);
  }

  const evSales5YrAvg = evSalesMultiples.length >= 2
    ? Math.round(evSalesMultiples.reduce((a, b) => a + b, 0) / evSalesMultiples.length * 100) / 100
    : null;

  return { evSales5YrAvg, evEbitda5YrAvg: null }; // EBITDA history not available from Polygon
}

// ═══════════════════════════════════════════
// ENRICHMENT ORCHESTRATOR
// ═══════════════════════════════════════════

/**
 * Enrich a stock with all derived fields.
 * Call this during Stage 3 after fetching fundamentals and historicals.
 */
function enrichStock(fund, historicals) {
  const enriched = {};

  // Beta
  enriched.beta = computeBeta(historicals.weeklyCloses);

  // Forward P/E
  enriched.forwardPE = computeForwardPE(
    fund.currentPrice,
    fund.epsDiluted,
    fund.revenueGrowth3YrAvg
  );

  // GAAP divergence
  enriched.gaapDivergence = computeGaapDivergence(
    fund.operatingIncome,
    fund.netIncome,
    fund.revenueCurrent
  );

  // Historical EV multiples
  const evMultiples = computeHistoricalEVMultiples(
    fund.revenueHistory,
    historicals.monthlyCloses,
    fund.totalDebt,
    fund.cashAndEquivalents,
    fund.dilutedShares || fund.sharesOutstanding
  );
  enriched.evSales5YrAvg = evMultiples.evSales5YrAvg;
  enriched.evEbitda5YrAvg = evMultiples.evEbitda5YrAvg;

  return enriched;
}

module.exports = {
  getSpyReturns,
  computeBeta,
  computeForwardPE,
  computeGaapDivergence,
  computeHistoricalEVMultiples,
  enrichStock,
};
