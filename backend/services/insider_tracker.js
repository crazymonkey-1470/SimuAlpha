'use strict';

/**
 * Insider Tracker Service
 *
 * Provides access to:
 *   - Recent insider purchases (Form 4 filings)
 *   - Insider buying sentiment at support levels
 *
 * Base URL: https://api.exa.ai/search
 * Auth: Header x-api-key=EXA_API_KEY
 * Docs: https://docs.exa.ai/
 */

const https = require('https');
const log = require('./logger').child({ module: 'insider_tracker' });

const BASE_URL = 'api.exa.ai';
const API_KEY = process.env.EXA_API_KEY;
const TIMEOUT_MS = 10000;

/**
 * Make POST request to Exa API with timeout
 * @private
 * @param {string} body - JSON stringified request body
 * @returns {Promise<{data: any, error?: string}>}
 */
function makeExaRequest(body) {
  return new Promise((resolve) => {
    const options = {
      hostname: BASE_URL,
      path: '/search',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-api-key': API_KEY,
      },
      timeout: TIMEOUT_MS,
    };

    const request = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ data: parsed });
        } catch (e) {
          log.error({ err: e }, 'JSON parse failed');
          resolve({ data: null, error: 'Invalid JSON response' });
        }
      });
    });

    request.on('timeout', () => {
      log.warn('Exa request timeout');
      request.destroy();
      resolve({ data: null, error: 'Request timeout' });
    });

    request.on('error', (e) => {
      log.error({ err: e }, 'HTTPS request failed');
      resolve({ data: null, error: e.message });
    });

    request.write(body);
    request.end();
  });
}

/**
 * Get recent insider purchases for a ticker
 * @param {string} ticker - Stock ticker (e.g., 'AAPL')
 * @param {number} [days=30] - Look back period in days
 * @returns {Promise<{error: boolean, data?: Array<{title: string, url: string, date: string, summary: string}>, message?: string}>}
 */
async function getRecentInsiderBuys(ticker, days = 30) {
  if (!ticker || typeof ticker !== 'string') {
    return { error: true, message: 'Invalid ticker' };
  }

  if (!API_KEY) {
    return {
      error: true,
      message: 'EXA_API_KEY not set - get free key at exa.ai',
    };
  }

  const query = `${ticker} CEO CFO insider purchase Form 4 SEC 2026`;

  const requestBody = JSON.stringify({
    query,
    include_domains: ['sec.gov', 'openinsider.com'],
    num_results: 5,
    type: 'auto',
  });

  const { data, error } = await makeExaRequest(requestBody);

  if (error) {
    log.warn({ ticker, days, error }, 'Insider buys fetch failed');
    return { error: true, message: error };
  }

  if (!data) {
    log.warn({ ticker }, 'Insider buys returned null');
    return { error: true, message: 'No data returned' };
  }

  if (data.error) {
    log.warn({ ticker, apiError: data.error }, 'Exa API error');
    return { error: true, message: data.error };
  }

  const results = (data.results || []).map((item) => ({
    title: item.title || '',
    url: item.url || '',
    date: item.publishedDate || item.date || new Date().toISOString(),
    summary: item.text || item.summary || '',
  }));

  log.info({ ticker, days, count: results.length }, 'Insider buys fetched');
  return { error: false, data: results };
}

/**
 * Assess if insiders are buying at support levels
 * @param {string} ticker - Stock ticker (e.g., 'AAPL')
 * @returns {Promise<{error: boolean, data?: {buying: boolean, evidence: string}, message?: string}>}
 */
async function isInsiderBuyingAtSupport(ticker) {
  if (!ticker || typeof ticker !== 'string') {
    return { error: true, message: 'Invalid ticker' };
  }

  const { error, data: results } = await getRecentInsiderBuys(ticker, 30);

  if (error) {
    return { error: true, message: 'Failed to fetch insider buys' };
  }

  const buyingKeywords = [
    'purchase',
    'bought',
    'buying',
    'open market',
    'insider purchase',
    'officer purchase',
    'director purchase',
  ];
  const supportKeywords = ['support', 'resistance', 'floor', 'level', 'bounce', 'recovery'];

  const relevantResults = results.filter((item) => {
    const content = `${item.title} ${item.summary}`.toLowerCase();
    return buyingKeywords.some((kw) => content.includes(kw));
  });

  const evidenceResults = relevantResults.filter((item) => {
    const content = `${item.title} ${item.summary}`.toLowerCase();
    return supportKeywords.some((kw) => content.includes(kw));
  });

  const buying = relevantResults.length > 0;
  const evidence =
    evidenceResults.length > 0
      ? `Found ${evidenceResults.length} evidence of insider buying at support levels`
      : `Found ${relevantResults.length} insider purchases in recent period`;

  log.info({ ticker, buying, evidenceCount: evidenceResults.length }, 'Insider buying assessed');
  return {
    error: false,
    data: {
      buying,
      evidence,
    },
  };
}

module.exports = {
  getRecentInsiderBuys,
  isInsiderBuyingAtSupport,
};
