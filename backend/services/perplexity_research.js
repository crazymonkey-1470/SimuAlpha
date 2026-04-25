'use strict';

/**
 * Perplexity Research Service
 *
 * Provides deep research capabilities via Perplexity AI:
 *   - Ticker-specific research with citations
 *   - Thesis validation and research
 *   - Mainstream coverage detection (CNBC, Bloomberg, WSJ, Reuters)
 *
 * API: https://api.perplexity.ai/chat/completions
 * Model: sonar (latest real-time search model)
 * Auth: Bearer token from PERPLEXITY_API_KEY
 */

const https = require('https');
const log = require('./logger').child({ module: 'perplexity_research' });

const API_URL = 'https://api.perplexity.ai/chat/completions';
const API_KEY = process.env.PERPLEXITY_API_KEY;
const TIMEOUT_MS = 30000;

/**
 * Make POST request to Perplexity API
 * @private
 * @param {object} payload - Request body
 * @returns {Promise<{data: any, error?: string}>}
 */
function makeRequest(payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);

    const opts = {
      hostname: 'api.perplexity.ai',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: TIMEOUT_MS,
    };

    const request = https.request(opts, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ data: parsed });
        } catch (e) {
          log.error({ err: e }, 'JSON parse failed from Perplexity');
          resolve({ data: null, error: 'Invalid JSON response' });
        }
      });
    });

    request.on('timeout', () => {
      log.warn('Perplexity request timeout');
      request.destroy();
      resolve({ data: null, error: 'Request timeout' });
    });

    request.on('error', (e) => {
      log.error({ err: e }, 'HTTPS request failed to Perplexity');
      resolve({ data: null, error: e.message });
    });

    request.write(body);
    request.end();
  });
}

/**
 * Research a specific ticker with a custom question
 * @param {string} ticker - Stock ticker (e.g., 'AAPL')
 * @param {string} question - Custom research question
 * @returns {Promise<{error: boolean, content?: string, citations?: any[], message?: string}>}
 */
async function researchTicker(ticker, question) {
  if (!ticker || !question) {
    return { error: true, message: 'Both ticker and question are required' };
  }

  if (!API_KEY) {
    log.error('PERPLEXITY_API_KEY not set');
    return { error: true, message: 'Perplexity API key not configured' };
  }

  const prompt = `Provide detailed research on ${ticker.toUpperCase()} addressing the following: ${question}`;

  const payload = {
    model: 'sonar',
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    return_citations: true,
  };

  const { data, error } = await makeRequest(payload);

  if (error) {
    log.warn({ ticker, error }, 'Ticker research failed');
    return { error: true, message: error };
  }

  if (!data) {
    log.warn({ ticker }, 'Ticker research returned null');
    return { error: true, message: 'No data returned' };
  }

  if (data.error) {
    log.warn({ ticker, apiError: data.error }, 'Perplexity API error');
    return { error: true, message: data.error.message || 'API error' };
  }

  const choice = data.choices && data.choices[0];
  if (!choice || !choice.message) {
    log.warn({ ticker }, 'No message in Perplexity response');
    return { error: true, message: 'No response content' };
  }

  log.info({ ticker, contentLength: choice.message.content.length }, 'Ticker research completed');

  return {
    error: false,
    content: choice.message.content,
    citations: data.citations || [],
  };
}

/**
 * Research and validate an investment thesis
 * @param {string} thesis - Investment thesis to research
 * @returns {Promise<{error: boolean, content?: string, citations?: any[], message?: string}>}
 */
async function researchThesis(thesis) {
  if (!thesis) {
    return { error: true, message: 'Thesis is required' };
  }

  if (!API_KEY) {
    log.error('PERPLEXITY_API_KEY not set');
    return { error: true, message: 'Perplexity API key not configured' };
  }

  const prompt = `Conduct thorough research on the following investment thesis and provide evidence-based analysis, counterarguments, and supporting data:\n\n${thesis}`;

  const payload = {
    model: 'sonar',
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    return_citations: true,
  };

  const { data, error } = await makeRequest(payload);

  if (error) {
    log.warn({ error }, 'Thesis research failed');
    return { error: true, message: error };
  }

  if (!data) {
    log.warn('Thesis research returned null');
    return { error: true, message: 'No data returned' };
  }

  if (data.error) {
    log.warn({ apiError: data.error }, 'Perplexity API error');
    return { error: true, message: data.error.message || 'API error' };
  }

  const choice = data.choices && data.choices[0];
  if (!choice || !choice.message) {
    log.warn('No message in Perplexity response');
    return { error: true, message: 'No response content' };
  }

  log.info({ contentLength: choice.message.content.length }, 'Thesis research completed');

  return {
    error: false,
    content: choice.message.content,
    citations: data.citations || [],
  };
}

/**
 * Check if a ticker/trend has mainstream coverage
 * @param {string} ticker - Stock ticker to check
 * @returns {Promise<{error: boolean, covered?: boolean, evidence?: string, message?: string}>}
 */
async function checkMainstreamCoverage(ticker) {
  if (!ticker) {
    return { error: true, message: 'Ticker is required' };
  }

  if (!API_KEY) {
    log.error('PERPLEXITY_API_KEY not set');
    return { error: true, message: 'Perplexity API key not configured' };
  }

  const prompt = `Has ${ticker.toUpperCase()} been covered by major financial news outlets (CNBC, Bloomberg, WSJ, Reuters) in the last 30 days? Provide specific articles or news items if available, and a brief summary of the coverage.`;

  const payload = {
    model: 'sonar',
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    return_citations: true,
  };

  const { data, error } = await makeRequest(payload);

  if (error) {
    log.warn({ ticker, error }, 'Mainstream coverage check failed');
    return { error: true, message: error };
  }

  if (!data) {
    log.warn({ ticker }, 'Coverage check returned null');
    return { error: true, message: 'No data returned' };
  }

  if (data.error) {
    log.warn({ ticker, apiError: data.error }, 'Perplexity API error');
    return { error: true, message: data.error.message || 'API error' };
  }

  const choice = data.choices && data.choices[0];
  if (!choice || !choice.message) {
    log.warn({ ticker }, 'No message in Perplexity response');
    return { error: true, message: 'No response content' };
  }

  const content = choice.message.content.toLowerCase();
  const covered = content.includes('yes') || content.includes('covered') || (data.citations && data.citations.length > 0);

  log.info({ ticker, covered }, 'Mainstream coverage check completed');

  return {
    error: false,
    covered,
    evidence: choice.message.content,
  };
}

module.exports = {
  researchTicker,
  researchThesis,
  checkMainstreamCoverage,
};
