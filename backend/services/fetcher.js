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

// ── Scraper: Company profile ──

async function fetchProfile(ticker) {
  try {
    const res = await fetch(`${SCRAPER_URL}/fundamentals/${ticker}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Also fetch historical to get current price and 52w high
    let currentPrice = null;
    let week52High = null;
    try {
      const histRes = await fetch(`${SCRAPER_URL}/historical/${ticker}`);
      if (histRes.ok) {
        const histData = await histRes.json();
        const weekly = histData.weekly || [];
        const monthly = histData.monthly || [];
        // Current price = last close available
        if (weekly.length > 0) {
          currentPrice = weekly[weekly.length - 1].close;
        } else if (monthly.length > 0) {
          currentPrice = monthly[monthly.length - 1].close;
        }
        // 52-week high = max close in last 52 weekly entries (or all monthly in last year)
        const recentWeekly = weekly.slice(-52);
        if (recentWeekly.length > 0) {
          week52High = Math.max(...recentWeekly.map((d) => d.close).filter((c) => c != null));
        } else if (monthly.length > 0) {
          const recentMonthly = monthly.slice(-12);
          week52High = Math.max(...recentMonthly.map((d) => d.close).filter((c) => c != null));
        }
      }
    } catch (_) { /* historical fetch optional for profile */ }

    return {
      companyName: data.company_name || data.ticker || ticker,
      sector: null,
      industry: null,
      marketCap: data.revenue_current ? data.revenue_current * 5 : null, // rough estimate; scraper doesn't provide market cap
      currentPrice,
      week52High,
      exchange: null,
    };
  } catch (err) {
    console.error(`[fetcher] profile failed ${ticker}:`, err.message);
    return null;
  }
}

// ── Scraper: Income statement (revenue) ──

async function fetchIncomeStatement(ticker) {
  try {
    const res = await fetch(`${SCRAPER_URL}/fundamentals/${ticker}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      revenueCurrent: data.revenue_current ?? null,
      revenuePrior: data.revenue_prior_year ?? null,
      revenueGrowthPct: data.revenue_growth_pct ?? null,
    };
  } catch (err) {
    console.error(`[fetcher] income failed ${ticker}:`, err.message);
    return { revenueCurrent: null, revenuePrior: null, revenueGrowthPct: null };
  }
}

// ── Scraper: Ratios (P/E, P/S) ──

async function fetchRatios(ticker) {
  try {
    const res = await fetch(`${SCRAPER_URL}/fundamentals/${ticker}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      peRatio: data.pe_ratio ?? null,
      psRatio: data.ps_ratio ?? null,
    };
  } catch (err) {
    console.error(`[fetcher] ratios failed ${ticker}:`, err.message);
    return { peRatio: null, psRatio: null };
  }
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

// ── Scraper: Current quote ──

async function fetchQuote(ticker) {
  try {
    // Get company name from fundamentals
    const fundRes = await fetch(`${SCRAPER_URL}/fundamentals/${ticker}`);
    let companyName = ticker;
    if (fundRes.ok) {
      const fundData = await fundRes.json();
      companyName = fundData.company_name || fundData.ticker || ticker;
    }

    // Get current price and 52w high from historical data
    let currentPrice = null;
    let week52High = null;
    const histRes = await fetch(`${SCRAPER_URL}/historical/${ticker}`);
    if (histRes.ok) {
      const histData = await histRes.json();
      const weekly = histData.weekly || [];
      const monthly = histData.monthly || [];
      if (weekly.length > 0) {
        currentPrice = weekly[weekly.length - 1].close;
        const recent52w = weekly.slice(-52);
        week52High = Math.max(...recent52w.map((d) => d.close).filter((c) => c != null));
      } else if (monthly.length > 0) {
        currentPrice = monthly[monthly.length - 1].close;
        const recent12m = monthly.slice(-12);
        week52High = Math.max(...recent12m.map((d) => d.close).filter((c) => c != null));
      }
    }

    return {
      currentPrice,
      week52High,
      companyName,
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
