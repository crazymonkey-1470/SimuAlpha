'use strict';

/**
 * research_routes.js
 * Research API endpoints — news, earnings, fundamentals, thesis validation
 */

const express = require('express');
const router = express.Router();
const log = require('../services/logger').child({ module: 'research_routes' });

const finnhub = require('../services/finnhub_news');
const perplexity = require('../services/perplexity_research');

// ────────────────────────────────────────────────────
// FINNHUB NEWS ENDPOINTS
// ────────────────────────────────────────────────────

/**
 * GET /api/research/news/:ticker?days=7
 * Fetch news for a specific ticker
 */
router.get('/api/research/news/:ticker', async (req, res) => {
  try {
    const { ticker } = req.params;
    const { days = 7 } = req.query;
    const daysNum = Math.min(Math.max(parseInt(days) || 7, 1), 90);

    if (!ticker || ticker.length === 0) {
      return res.status(400).json({ error: true, message: 'Ticker required' });
    }

    const result = await finnhub.getTickerNews(ticker, daysNum);
    if (result.error) {
      return res.status(500).json(result);
    }

    res.json({
      error: false,
      ticker: ticker.toUpperCase(),
      days: daysNum,
      count: result.data.length,
      articles: result.data,
    });
  } catch (err) {
    log.error({ err }, 'Ticker news endpoint failed');
    res.status(500).json({ error: true, message: err.message });
  }
});

/**
 * GET /api/research/market-news?category=general
 * Fetch market news by category
 */
router.get('/api/research/market-news', async (req, res) => {
  try {
    const { category = 'general' } = req.query;

    const result = await finnhub.getMarketNews(category);
    if (result.error) {
      return res.status(500).json(result);
    }

    res.json({
      error: false,
      category: category || 'general',
      count: result.data.length,
      articles: result.data,
    });
  } catch (err) {
    log.error({ err }, 'Market news endpoint failed');
    res.status(500).json({ error: true, message: err.message });
  }
});

/**
 * GET /api/research/earnings?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Fetch earnings calendar
 */
router.get('/api/research/earnings', async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        error: true,
        message: 'Both from and to dates required (YYYY-MM-DD format)',
      });
    }

    const result = await finnhub.getEarningsCalendar(from, to);
    if (result.error) {
      return res.status(500).json(result);
    }

    res.json({
      error: false,
      from,
      to,
      count: result.data.length,
      earnings: result.data,
    });
  } catch (err) {
    log.error({ err }, 'Earnings calendar endpoint failed');
    res.status(500).json({ error: true, message: err.message });
  }
});

// ────────────────────────────────────────────────────
// PERPLEXITY RESEARCH ENDPOINTS
// ────────────────────────────────────────────────────

/**
 * POST /api/research/ticker
 * Research a specific ticker with a custom question
 * Body: { ticker, question }
 */
router.post('/api/research/ticker', async (req, res) => {
  try {
    const { ticker, question } = req.body;

    if (!ticker || !question) {
      return res.status(400).json({
        error: true,
        message: 'Both ticker and question required',
      });
    }

    const result = await perplexity.researchTicker(ticker, question);
    if (result.error) {
      return res.status(500).json(result);
    }

    res.json({
      error: false,
      ticker: ticker.toUpperCase(),
      question,
      content: result.content,
      citations: result.citations || [],
    });
  } catch (err) {
    log.error({ err }, 'Ticker research endpoint failed');
    res.status(500).json({ error: true, message: err.message });
  }
});

/**
 * POST /api/research/thesis
 * Research and validate an investment thesis
 * Body: { thesis }
 */
router.post('/api/research/thesis', async (req, res) => {
  try {
    const { thesis } = req.body;

    if (!thesis || thesis.length === 0) {
      return res.status(400).json({
        error: true,
        message: 'Thesis required',
      });
    }

    const result = await perplexity.researchThesis(thesis);
    if (result.error) {
      return res.status(500).json(result);
    }

    res.json({
      error: false,
      thesis,
      content: result.content,
      citations: result.citations || [],
    });
  } catch (err) {
    log.error({ err }, 'Thesis research endpoint failed');
    res.status(500).json({ error: true, message: err.message });
  }
});

/**
 * GET /api/research/mainstream-check/:ticker
 * Check if a ticker has mainstream coverage
 */
router.get('/api/research/mainstream-check/:ticker', async (req, res) => {
  try {
    const { ticker } = req.params;

    if (!ticker || ticker.length === 0) {
      return res.status(400).json({ error: true, message: 'Ticker required' });
    }

    const result = await perplexity.checkMainstreamCoverage(ticker);
    if (result.error) {
      return res.status(500).json(result);
    }

    res.json({
      error: false,
      ticker: ticker.toUpperCase(),
      covered: result.covered,
      evidence: result.evidence,
    });
  } catch (err) {
    log.error({ err }, 'Mainstream check endpoint failed');
    res.status(500).json({ error: true, message: err.message });
  }
});

module.exports = router;
