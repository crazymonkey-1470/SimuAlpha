'use strict';

/**
 * Finnhub News Service
 *
 * Provides access to:
 *   - Ticker-specific news (last 7 days default)
 *   - Market news by category (general, forex, crypto)
 *   - Earnings calendar
 *
 * Base URL: https://finnhub.io/api/v1
 * Auth: Query parameter token=FINNHUB_API_KEY
 */

const https = require('https');
const log = require('./logger').child({ module: 'finnhub_news' });

const BASE_URL = 'https://finnhub.io/api/v1';
const API_KEY = process.env.FINNHUB_API_KEY;
const TIMEOUT_MS = 10000;

/**
 * Parse URL and make HTTPS request with timeout
 * @private
 * @param {string} url - Full URL to request
 * @returns {Promise<{data: any, error?: string}>}
 */
function makeRequest(url) {
  return new Promise((resolve) => {
    const request = https.get(url, { timeout: TIMEOUT_MS }, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ data: parsed });
        } catch (e) {
          log.error({ err: e, url: url.slice(0, 100) }, 'JSON parse failed');
          resolve({ data: null, error: 'Invalid JSON response' });
        }
      });
    });

    request.on('timeout', () => {
      log.warn({ url: url.slice(0, 100) }, 'Request timeout');
      request.destroy();
      resolve({ data: null, error: 'Request timeout' });
    });

    request.on('error', (e) => {
      log.error({ err: e, url: url.slice(0, 100) }, 'HTTPS request failed');
      resolve({ data: null, error: e.message });
    });
  });
}

/**
 * Get news for a specific ticker
 * @param {string} ticker - Stock ticker (e.g., 'AAPL')
 * @param {number} [days=7] - Look back period in days
 * @returns {Promise<{error: boolean, data?: any[], message?: string}>}
 */
async function getTickerNews(ticker, days = 7) {
  if (!ticker || typeof ticker !== 'string') {
    return { error: true, message: 'Invalid ticker' };
  }

  if (!API_KEY) {
    log.error('FINNHUB_API_KEY not set');
    return { error: true, message: 'Finnhub API key not configured' };
  }

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const from = fromDate.toISOString().split('T')[0];
  const to = new Date().toISOString().split('T')[0];

  const url = `${BASE_URL}/company-news?symbol=${encodeURIComponent(ticker.toUpperCase())}&from=${from}&to=${to}&token=${API_KEY}`;

  const { data, error } = await makeRequest(url);

  if (error) {
    log.warn({ ticker, days, error }, 'Ticker news fetch failed');
    return { error: true, message: error };
  }

  if (!data) {
    log.warn({ ticker }, 'Ticker news returned null');
    return { error: true, message: 'No data returned' };
  }

  // Finnhub returns array directly or { error: 'msg' }
  if (data.error) {
    log.warn({ ticker, apiError: data.error }, 'Finnhub API error');
    return { error: true, message: data.error };
  }

  log.info({ ticker, days, count: (data && data.length) || 0 }, 'Ticker news fetched');
  return { error: false, data: data || [] };
}

/**
 * Get market news by category
 * @param {string} [category='general'] - Category: 'general', 'forex', 'crypto', 'merger'
 * @returns {Promise<{error: boolean, data?: any[], message?: string}>}
 */
async function getMarketNews(category = 'general') {
  if (!API_KEY) {
    log.error('FINNHUB_API_KEY not set');
    return { error: true, message: 'Finnhub API key not configured' };
  }

  const validCategories = ['general', 'forex', 'crypto', 'merger'];
  const safeCategory = validCategories.includes(category) ? category : 'general';

  const url = `${BASE_URL}/news?category=${encodeURIComponent(safeCategory)}&token=${API_KEY}`;

  const { data, error } = await makeRequest(url);

  if (error) {
    log.warn({ category: safeCategory, error }, 'Market news fetch failed');
    return { error: true, message: error };
  }

  if (!data) {
    log.warn({ category: safeCategory }, 'Market news returned null');
    return { error: true, message: 'No data returned' };
  }

  if (data.error) {
    log.warn({ category: safeCategory, apiError: data.error }, 'Finnhub API error');
    return { error: true, message: data.error };
  }

  log.info({ category: safeCategory, count: (data && data.length) || 0 }, 'Market news fetched');
  return { error: false, data: data || [] };
}

/**
 * Get earnings calendar
 * @param {string} from - Start date (YYYY-MM-DD)
 * @param {string} to - End date (YYYY-MM-DD)
 * @returns {Promise<{error: boolean, data?: any[], message?: string}>}
 */
async function getEarningsCalendar(from, to) {
  if (!from || !to) {
    return { error: true, message: 'Both from and to dates required' };
  }

  if (!API_KEY) {
    log.error('FINNHUB_API_KEY not set');
    return { error: true, message: 'Finnhub API key not configured' };
  }

  // Basic validation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { error: true, message: 'Dates must be YYYY-MM-DD format' };
  }

  const url = `${BASE_URL}/calendar/earnings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&token=${API_KEY}`;

  const { data, error } = await makeRequest(url);

  if (error) {
    log.warn({ from, to, error }, 'Earnings calendar fetch failed');
    return { error: true, message: error };
  }

  if (!data) {
    log.warn({ from, to }, 'Earnings calendar returned null');
    return { error: true, message: 'No data returned' };
  }

  if (data.error) {
    log.warn({ from, to, apiError: data.error }, 'Finnhub API error');
    return { error: true, message: data.error };
  }

  // Finnhub returns { earningsCalendar: [...] }
  const earningsData = data.earningsCalendar || data;

  log.info({ from, to, count: (earningsData && earningsData.length) || 0 }, 'Earnings calendar fetched');
  return { error: false, data: earningsData || [] };
}

module.exports = {
  getTickerNews,
  getMarketNews,
  getEarningsCalendar,
};
