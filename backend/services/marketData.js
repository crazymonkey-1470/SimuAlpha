import yahooFinance from 'yahoo-finance2';

/**
 * Fetch current quote data for a ticker from Yahoo Finance.
 */
export async function getQuote(ticker) {
  try {
    const quote = await yahooFinance.quote(ticker);
    return {
      currentPrice: quote.regularMarketPrice,
      week52High: quote.fiftyTwoWeekHigh,
      week52Low: quote.fiftyTwoWeekLow,
      marketCap: quote.marketCap,
      shortName: quote.shortName || quote.longName || ticker,
    };
  } catch (err) {
    console.error(`[TLI] Failed to fetch quote for ${ticker}:`, err.message);
    return null;
  }
}

/**
 * Calculate 200-period Simple Moving Average from historical prices.
 * @param {string} ticker
 * @param {'weekly'|'monthly'} interval
 * @returns {number|null} The 200-period SMA or null
 */
async function calculateSMA(ticker, interval) {
  try {
    // Fetch enough history: ~5 years for weekly, ~20 years for monthly
    const yearsBack = interval === 'weekly' ? 5 : 20;
    const period1 = new Date();
    period1.setFullYear(period1.getFullYear() - yearsBack);

    const result = await yahooFinance.chart(ticker, {
      period1: period1.toISOString().split('T')[0],
      interval: interval === 'weekly' ? '1wk' : '1mo',
    });

    const quotes = result.quotes || [];
    const closes = quotes
      .map((q) => q.close)
      .filter((c) => c != null && !isNaN(c));

    if (closes.length < 200) {
      // Not enough data for 200-period SMA, use what we have
      if (closes.length < 50) return null;
      const sum = closes.reduce((a, b) => a + b, 0);
      return sum / closes.length;
    }

    // Take last 200 closes
    const last200 = closes.slice(-200);
    const sum = last200.reduce((a, b) => a + b, 0);
    return sum / 200;
  } catch (err) {
    console.error(`[TLI] Failed to calculate ${interval} SMA for ${ticker}:`, err.message);
    return null;
  }
}

/**
 * Get 200 Weekly Moving Average
 */
export async function get200WMA(ticker) {
  return calculateSMA(ticker, 'weekly');
}

/**
 * Get 200 Monthly Moving Average
 */
export async function get200MMA(ticker) {
  return calculateSMA(ticker, 'monthly');
}
