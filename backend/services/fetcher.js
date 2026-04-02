const yahooFinance = require('yahoo-finance2').default;

const FMP_BASE = 'https://financialmodelingprep.com/api/v3';
const FMP_KEY = () => process.env.FMP_API_KEY;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── FMP: Full stock list ──

async function fetchStockList() {
  const res = await fetch(`${FMP_BASE}/stock/list?apikey=${FMP_KEY()}`);
  if (!res.ok) throw new Error(`FMP stock/list failed: ${res.status}`);
  return res.json();
}

// ── FMP: Company profile ──

async function fetchProfile(ticker) {
  try {
    const res = await fetch(`${FMP_BASE}/profile/${ticker}?apikey=${FMP_KEY()}`);
    const data = await res.json();
    const p = Array.isArray(data) ? data[0] : data;
    return {
      companyName: p?.companyName || ticker,
      sector: p?.sector || null,
      industry: p?.industry || null,
      marketCap: p?.mktCap || null,
      currentPrice: p?.price || null,
      week52High: p?.range ? parseFloat(p.range.split('-')[1]) : null,
      exchange: p?.exchangeShortName || null,
    };
  } catch (err) {
    console.error(`[fetcher] profile failed ${ticker}:`, err.message);
    return null;
  }
}

// ── FMP: Income statement (revenue) ──

async function fetchIncomeStatement(ticker) {
  try {
    const res = await fetch(`${FMP_BASE}/income-statement/${ticker}?limit=2&apikey=${FMP_KEY()}`);
    const data = await res.json();
    const arr = Array.isArray(data) ? data : [];
    const revCurrent = arr[0]?.revenue ?? null;
    const revPrior = arr[1]?.revenue ?? null;
    let growthPct = null;
    if (revCurrent != null && revPrior != null && revPrior !== 0) {
      growthPct = ((revCurrent - revPrior) / Math.abs(revPrior)) * 100;
    }
    return { revenueCurrent: revCurrent, revenuePrior: revPrior, revenueGrowthPct: growthPct };
  } catch (err) {
    console.error(`[fetcher] income failed ${ticker}:`, err.message);
    return { revenueCurrent: null, revenuePrior: null, revenueGrowthPct: null };
  }
}

// ── FMP: Ratios TTM (P/E, P/S) ──

async function fetchRatios(ticker) {
  try {
    const res = await fetch(`${FMP_BASE}/ratios-ttm/${ticker}?apikey=${FMP_KEY()}`);
    const data = await res.json();
    const r = Array.isArray(data) ? data[0] : data;
    return {
      peRatio: r?.peRatioTTM ?? null,
      psRatio: r?.priceToSalesRatioTTM ?? null,
    };
  } catch (err) {
    console.error(`[fetcher] ratios failed ${ticker}:`, err.message);
    return { peRatio: null, psRatio: null };
  }
}

// ── Yahoo Finance: Historical prices ──

async function fetchHistoricalPrices(ticker) {
  try {
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    const twentyYearsAgo = new Date();
    twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20);

    const [weekly, monthly] = await Promise.all([
      yahooFinance.chart(ticker, {
        period1: fiveYearsAgo.toISOString().split('T')[0],
        interval: '1wk',
      }),
      yahooFinance.chart(ticker, {
        period1: twentyYearsAgo.toISOString().split('T')[0],
        interval: '1mo',
      }),
    ]);

    const weeklyCloses = (weekly.quotes || []).map((q) => q.close).filter((c) => c != null);
    const monthlyCloses = (monthly.quotes || []).map((q) => q.close).filter((c) => c != null);
    return { weeklyCloses, monthlyCloses };
  } catch (err) {
    console.error(`[fetcher] historical failed ${ticker}:`, err.message);
    return { weeklyCloses: [], monthlyCloses: [] };
  }
}

// ── Yahoo Finance: Current quote ──

async function fetchQuote(ticker) {
  try {
    const q = await yahooFinance.quote(ticker);
    return {
      currentPrice: q.regularMarketPrice ?? null,
      week52High: q.fiftyTwoWeekHigh ?? null,
      companyName: q.shortName || q.longName || ticker,
      sector: null,
    };
  } catch (err) {
    console.error(`[fetcher] quote failed ${ticker}:`, err.message);
    return { currentPrice: null, week52High: null, companyName: ticker, sector: null };
  }
}

// ── Moving averages ──

function calculate200WMA(closes) {
  if (!closes || closes.length < 50) return null;
  const d = closes.slice(-200);
  return d.reduce((a, b) => a + b, 0) / d.length;
}

function calculate200MMA(closes) {
  if (!closes || closes.length < 50) return null;
  const d = closes.slice(-200);
  return d.reduce((a, b) => a + b, 0) / d.length;
}

module.exports = {
  fetchStockList,
  fetchProfile,
  fetchIncomeStatement,
  fetchRatios,
  fetchHistoricalPrices,
  fetchQuote,
  calculate200WMA,
  calculate200MMA,
  sleep,
};
