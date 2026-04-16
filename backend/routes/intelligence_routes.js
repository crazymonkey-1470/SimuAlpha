'use strict';

/**
 * intelligence_routes.js
 * 9 critical endpoints for ALPHA intelligence layer
 * Full market state, signal tracking, factor analysis, risk assessment
 */

const express = require('express');
const router = express.Router();
const log = require('../services/logger').child({ module: 'intelligence_routes' });

const analyzer = require('../services/intelligence_analyzer');

// ────────────────────────────────────────────────────
// 1. CURRENT MARKET STATE
// ────────────────────────────────────────────────────

router.get('/api/intelligence/current-market-state', async (req, res) => {
  try {
    const state = await analyzer.getCurrentMarketState();
    res.json(state);
  } catch (err) {
    log.error({ err }, 'Market state failed');
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────
// 2. TOP SIGNALS TODAY
// ────────────────────────────────────────────────────

router.get('/api/intelligence/top-signals-today', async (req, res) => {
  try {
    const signals = await analyzer.getTopSignalsToday();
    res.json({ count: signals.length, signals });
  } catch (err) {
    log.error({ err }, 'Top signals failed');
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────
// 3. SIGNAL OUTCOMES
// ────────────────────────────────────────────────────

router.get('/api/intelligence/signal-outcomes', async (req, res) => {
  try {
    const outcomes = await analyzer.getSignalOutcomes();
    res.json(outcomes);
  } catch (err) {
    log.error({ err }, 'Outcomes failed');
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────
// 4. FACTOR ACCURACY
// ────────────────────────────────────────────────────

router.get('/api/intelligence/factor-accuracy', async (req, res) => {
  try {
    const factors = await analyzer.getFactorAccuracy();
    res.json({ count: factors.length, factors });
  } catch (err) {
    log.error({ err }, 'Factors failed');
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────
// 5. WAVE PATTERN STATS
// ────────────────────────────────────────────────────

router.get('/api/intelligence/wave-pattern-stats', async (req, res) => {
  try {
    const stats = await analyzer.getWavePatternStats();
    res.json(stats);
  } catch (err) {
    log.error({ err }, 'Wave stats failed');
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────
// 6. INSTITUTIONAL SNAPSHOT
// ────────────────────────────────────────────────────

router.get('/api/intelligence/institutional-snapshot', async (req, res) => {
  try {
    const snapshot = await analyzer.getInstitutionalSnapshot();
    res.json(snapshot);
  } catch (err) {
    log.error({ err }, 'Institutional snapshot failed');
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────
// 7. FUNDAMENTAL QUALIFIERS
// ────────────────────────────────────────────────────

router.get('/api/intelligence/fundamental-qualifiers', async (req, res) => {
  try {
    const qualifiers = await analyzer.getFundamentalQualifiers();
    res.json(qualifiers);
  } catch (err) {
    log.error({ err }, 'Qualifiers failed');
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────
// 8. BACKTEST BY SETUP
// ────────────────────────────────────────────────────

router.get('/api/intelligence/backtest-by-setup', async (req, res) => {
  try {
    const backtest = await analyzer.getBacktestBySetup();
    res.json(backtest);
  } catch (err) {
    log.error({ err }, 'Backtest by setup failed');
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────
// 9. RISK ASSESSMENT ENGINE
// ────────────────────────────────────────────────────

router.get('/api/intelligence/risk-assessment/:ticker', async (req, res) => {
  try {
    const { ticker } = req.params;
    if (!ticker) {
      return res.status(400).json({ error: 'Ticker required' });
    }
    const risk = await analyzer.getRiskAssessment(ticker.toUpperCase());
    res.json(risk);
  } catch (err) {
    log.error({ err }, `Risk assessment failed for ${req.params.ticker}`);
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────
// Health check
// ────────────────────────────────────────────────────

router.get('/api/intelligence/health', (req, res) => {
  res.json({ status: 'ok', service: 'intelligence', timestamp: new Date().toISOString() });
});

module.exports = router;
