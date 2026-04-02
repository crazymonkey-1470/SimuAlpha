const yahooFinance = require('yahoo-finance2').default;

const FMP_BASE = 'https://financialmodelingprep.com/api/v3';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch weekly and monthly historical closing prices from Yahoo Finance.
 */
async function getHistoricalPrices(ticker) {
  try {
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

    const twentyYearsAgo = new Date();
    twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20);

    const [weeklyResult, monthlyResult] = await Promise.all([
      yahooFinance.chart(ticker, {
        period1: fiveYearsAgo.toISOString().split('T')[0],
        interval: '1wk',
      }),
      yahooFinance.chart(ticker, {
        period1: twentyYearsAgo.toISOString().split('T')[0],
        interval: '1mo',
      }),
    ]);

    const weeklyCloses = (weeklyResult.quotes || [])
      .map((q) => q.close)
      .filter((c) => c != null && !isNaN(c));

    const monthlyCloses = (monthlyResult.quotes || [])
      .map((q) => q.close)
      .filter((c) => c != null && !isNaN(c));

    return { weeklyCloses, monthlyCloses };
  } catch (err) {
    console.error(`[fetcher] Historical prices failed for ${ticker}:`, err.message);
    return { weeklyCloses: [], monthlyCloses: [] };
  }
}

/**
 * Calculate 200-period simple moving average.
 */
function calculate200WMA(weeklyCloses) {
  if (!weeklyCloses || weeklyCloses.length < 50) return null;
  const data = weeklyCloses.slice(-200);
  const sum = data.reduce((a, b) => a + b, 0);
  return sum / data.length;
}

function calculate200MMA(monthlyCloses) {
  if (!monthlyCloses || monthlyCloses.length < 50) return null;
  const data = monthlyCloses.slice(-200);
  const sum = data.reduce((a, b) => a + b, 0);
  return sum / data.length;
}

/**
 * Get current quote data from Yahoo Finance.
 */
async function getQuote(ticker) {
  try {
    const quote = await yahooFinance.quote(ticker);
    return {
      currentPrice: quote.regularMarketPrice ?? null,
      week52High: quote.fiftyTwoWeekHigh ?? null,
      companyName: quote.shortName || quote.longName || ticker,
      sector: null, // Yahoo quote doesn't always include sector
    };
  } catch (err) {
    console.error(`[fetcher] Quote failed for ${ticker}:`, err.message);
    return { currentPrice: null, week52High: null, companyName: ticker, sector: null };
  }
}

/**
 * Get fundamental data from Financial Modeling Prep.
 */
async function getFundamentals(ticker) {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    console.warn('[fetcher] FMP_API_KEY not set, skipping fundamentals');
    return { revenueCurrent: null, revenuePrior: null, revenueGrowthPct: null, peRatio: null, psRatio: null, sector: null };
  }

  try {
    const [incomeRes, ratiosRes, profileRes] = await Promise.all([
      fetch(`${FMP_BASE}/income-statement/${ticker}?limit=2&apikey=${apiKey}`),
      fetch(`${FMP_BASE}/ratios-ttm/${ticker}?apikey=${apiKey}`),
      fetch(`${FMP_BASE}/profile/${ticker}?apikey=${apiKey}`),
    ]);

    const income = await incomeRes.json();
    const ratios = await ratiosRes.json();
    const profile = await profileRes.json();

    const incomeArr = Array.isArray(income) ? income : [];
    const ratiosObj = Array.isArray(ratios) && ratios[0] ? ratios[0] : {};
    const profileObj = Array.isArray(profile) && profile[0] ? profile[0] : {};

    const revenueCurrent = incomeArr[0]?.revenue ?? null;
    const revenuePrior = incomeArr[1]?.revenue ?? null;

    let revenueGrowthPct = null;
    if (revenueCurrent != null && revenuePrior != null && revenuePrior !== 0) {
      revenueGrowthPct = ((revenueCurrent - revenuePrior) / Math.abs(revenuePrior)) * 100;
    }

    return {
      revenueCurrent,
      revenuePrior,
      revenueGrowthPct,
      peRatio: ratiosObj.peRatioTTM ?? null,
      psRatio: ratiosObj.priceToSalesRatioTTM ?? null,
      sector: profileObj.sector ?? null,
    };
  } catch (err) {
    console.error(`[fetcher] Fundamentals failed for ${ticker}:`, err.message);
    return { revenueCurrent: null, revenuePrior: null, revenueGrowthPct: null, peRatio: null, psRatio: null, sector: null };
  }
}

module.exports = {
  getHistoricalPrices,
  calculate200WMA,
  calculate200MMA,
  getQuote,
  getFundamentals,
  sleep,
};
