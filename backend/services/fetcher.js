const SCRAPER_URL = process.env.SCRAPER_URL || 'http://localhost:8000';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Scraper: Full stock list ──

async function fetchStockList() {
  const res = await fetch(`${SCRAPER_URL}/universe/`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Scraper universe failed: ${res.status}`);
  const data = await res.json();
  const stocks = data.stocks || [];

  // Map to the format the pipeline expects
  return stocks.map((s) => ({
    symbol: s.ticker,
    name: s.company_name,
    exchangeShortName: s.exchange === 'US' ? 'NYSE' : s.exchange,
    price: s.current_price,
    type: 'stock',
  }));
}

// ── Scraper: Historical prices ──

async function fetchHistoricalPrices(ticker) {
  try {
    const res = await fetch(`${SCRAPER_URL}/historical/${ticker}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const weeklyCloses = (data.weekly || []).map((d) => d.close).filter((c) => c != null);
    const monthlyCloses = (data.monthly || []).map((d) => d.close).filter((c) => c != null);
    return { weeklyCloses, monthlyCloses };
  } catch (err) {
    console.error(`[fetcher] historical failed ${ticker}:`, err.message);
    return { weeklyCloses: [], monthlyCloses: [] };
  }
}

// ── Moving averages ──
// 200 WMA = 200-Week Simple Moving Average (SMA of last 200 weekly closes)
// 200 MMA = 200-Month Simple Moving Average (SMA of last 200 monthly closes)
// TLI methodology uses SMA, not exponential or weighted averages.
// Falls back to shorter periods if insufficient data (min 50 weeks / 12 months).

function calculate200WMA(closes) {
  if (!closes || closes.length < 50) return null;
  const period = Math.min(closes.length, 200);
  const d = closes.slice(-period);
  return d.reduce((a, b) => a + b, 0) / d.length;
}

function calculate200MMA(closes) {
  if (!closes || closes.length < 12) return null;
  const period = Math.min(closes.length, 200);
  const d = closes.slice(-period);
  return d.reduce((a, b) => a + b, 0) / d.length;
}

// ── Combined fundamentals (single call instead of 3) ──

async function fetchFundamentals(ticker) {
  try {
    const res = await fetch(`${SCRAPER_URL}/fundamentals/${ticker}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      companyName: data.company_name || data.ticker || ticker,
      sector: data.sector || null,
      marketCap: data.market_cap ?? null,
      currentPrice: data.current_price ?? null,
      week52High: data.week_52_high ?? null,
      revenueCurrent: data.revenue_current ?? null,
      revenuePrior: data.revenue_prior_year ?? null,
      revenueGrowthPct: data.revenue_growth_pct ?? null,
      peRatio: data.pe_ratio ?? null,
      psRatio: data.ps_ratio ?? null,
    };
  } catch (err) {
    console.error(`[fetcher] fundamentals failed ${ticker}:`, err.message);
    return null;
  }
}

module.exports = {
  fetchStockList,
  fetchHistoricalPrices,
  fetchFundamentals,
  calculate200WMA,
  calculate200MMA,
  sleep,
};
