'use strict';

/**
 * FRED Macro Service
 *
 * Provides access to:
 *   - Macro snapshot (Fed Funds, CPI, Unemployment, Yield Curve, VIX, 10Y Treasury)
 *   - Market regime assessment (RISK_ON, RISK_OFF, TRANSITIONING)
 *
 * Base URL: https://api.stlouisfed.org/fred/series/observations
 * Auth: Query parameter api_key=FRED_API_KEY
 * Docs: https://fred.stlouisfed.org/docs/api/
 */

const https = require('https');
const log = require('./logger').child({ module: 'fred_macro' });

const BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';
const API_KEY = process.env.FRED_API_KEY;
const TIMEOUT_MS = 10000;

const FRED_SERIES = {
  fedFunds: 'FEDFUNDS',
  cpi: 'CPIAUCSL',
  unemployment: 'UNRATE',
  yieldCurve: 'T10Y2Y',
  vix: 'VIXCLS',
  treasury10y: 'DGS10',
};

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
 * Fetch single FRED series observation
 * @private
 * @param {string} seriesId - FRED series ID
 * @returns {Promise<{value: number | null, date: string | null, error?: string}>}
 */
async function fetchSeriesValue(seriesId) {
  const url = `${BASE_URL}?series_id=${encodeURIComponent(seriesId)}&limit=1&sort_order=desc&api_key=${API_KEY}&file_type=json`;

  const { data, error } = await makeRequest(url);

  if (error) {
    log.warn({ seriesId, error }, 'FRED series fetch failed');
    return { value: null, date: null, error };
  }

  if (!data || data.error) {
    log.warn({ seriesId, apiError: data?.error }, 'FRED API error');
    return { value: null, date: null, error: data?.error || 'No data returned' };
  }

  const observations = data.observations || [];
  if (observations.length === 0) {
    log.warn({ seriesId }, 'No observations returned');
    return { value: null, date: null, error: 'No observations' };
  }

  const latest = observations[0];
  const value = latest.value === '.' ? null : parseFloat(latest.value);

  return { value, date: latest.date };
}

/**
 * Get macro snapshot with latest values from FRED
 * @returns {Promise<{error: boolean, data?: {fedFunds: number | null, cpi: number | null, unemployment: number | null, yieldCurve: number | null, vix: number | null, treasury10y: number | null, timestamp: string}, message?: string}>}
 */
async function getMacroSnapshot() {
  if (!API_KEY) {
    return {
      error: true,
      message: 'FRED_API_KEY not set - get free key at fred.stlouisfed.org/docs/api/api_key.html',
    };
  }

  const results = await Promise.all([
    fetchSeriesValue(FRED_SERIES.fedFunds),
    fetchSeriesValue(FRED_SERIES.cpi),
    fetchSeriesValue(FRED_SERIES.unemployment),
    fetchSeriesValue(FRED_SERIES.yieldCurve),
    fetchSeriesValue(FRED_SERIES.vix),
    fetchSeriesValue(FRED_SERIES.treasury10y),
  ]);

  const snapshot = {
    fedFunds: results[0].value,
    cpi: results[1].value,
    unemployment: results[2].value,
    yieldCurve: results[3].value,
    vix: results[4].value,
    treasury10y: results[5].value,
    timestamp: new Date().toISOString(),
  };

  const hasErrors = results.some((r) => r.error);
  if (hasErrors) {
    log.warn({ errors: results.filter((r) => r.error).map((r) => r.error) }, 'Some FRED series failed');
  }

  log.info({ snapshot }, 'Macro snapshot retrieved');
  return { error: false, data: snapshot };
}

/**
 * Assess market regime based on macro indicators
 * @returns {Promise<{error: boolean, data?: {regime: string, signals: string[], confidence: number}, message?: string}>}
 */
async function assessMarketRegime() {
  if (!API_KEY) {
    return {
      error: true,
      message: 'FRED_API_KEY not set - get free key at fred.stlouisfed.org/docs/api/api_key.html',
    };
  }

  const { error, data: snapshot } = await getMacroSnapshot();

  if (error) {
    return { error: true, message: 'Failed to fetch macro snapshot' };
  }

  const signals = [];
  let riskScore = 0;

  // VIX assessment
  if (snapshot.vix !== null) {
    if (snapshot.vix > 25) {
      signals.push(`VIX elevated at ${snapshot.vix.toFixed(2)}`);
      riskScore += 2;
    } else if (snapshot.vix < 18) {
      signals.push(`VIX complacent at ${snapshot.vix.toFixed(2)}`);
      riskScore -= 2;
    }
  }

  // Yield curve assessment
  if (snapshot.yieldCurve !== null) {
    if (snapshot.yieldCurve < 0) {
      signals.push(`Yield curve inverted at ${snapshot.yieldCurve.toFixed(2)}`);
      riskScore += 2;
    } else if (snapshot.yieldCurve > 0.5) {
      signals.push(`Yield curve steep at ${snapshot.yieldCurve.toFixed(2)}`);
      riskScore -= 1;
    }
  }

  // Unemployment assessment
  if (snapshot.unemployment !== null) {
    if (snapshot.unemployment > 4.5) {
      signals.push(`Unemployment elevated at ${snapshot.unemployment.toFixed(2)}%`);
      riskScore += 1;
    }
  }

  let regime = 'TRANSITIONING';
  let confidence = 0.5;

  if (riskScore >= 2) {
    regime = 'RISK_OFF';
    confidence = Math.min(1, 0.5 + Math.abs(riskScore) * 0.15);
  } else if (riskScore <= -2) {
    regime = 'RISK_ON';
    confidence = Math.min(1, 0.5 + Math.abs(riskScore) * 0.15);
  }

  log.info({ regime, signals, confidence }, 'Market regime assessed');
  return {
    error: false,
    data: {
      regime,
      signals,
      confidence: Math.round(confidence * 100) / 100,
    },
  };
}

module.exports = {
  getMacroSnapshot,
  assessMarketRegime,
};
