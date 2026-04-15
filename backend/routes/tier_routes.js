/**
 * tier_routes.js
 *
 * API routes for TIER 1-4 services.
 * Public endpoints:   backtest summary, learning principles, waitlist
 * Admin  endpoints:   approval workflow, weight adjustments
 *
 * All GET endpoints now query real tables via Supabase — no mock data.
 */

const express = require('express');
const router  = express.Router();
const log     = require('../services/logger').child({ module: 'tier_routes' });
const supabase = require('../services/supabase');

const backtester    = require('../services/backtester_v2');
const learningCycle = require('../services/learning_cycle_v2');
const emailService  = require('../services/email_service');

// Simple admin auth guard.
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_API_KEY || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ============== PUBLIC ENDPOINTS ==============

/**
 * GET /api/tier/backtest/summary
 * Aggregate metrics across all stored runs, grouped by tier.
 */
router.get('/api/tier/backtest/summary', async (req, res) => {
  try {
    const summary = await backtester.getBacktestSummary({ limit: 2000 });
    if (!summary) return res.status(500).json({ error: 'Failed to compute summary' });
    res.json(summary);
  } catch (err) {
    log.error({ err }, 'Failed to fetch backtest summary');
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

/**
 * GET /api/tier/backtest/by-tier/:tier
 * Metrics for a single tier.
 */
router.get('/api/tier/backtest/by-tier/:tier', async (req, res) => {
  try {
    const { tier } = req.params;
    const result = await backtester.getBacktestByTier(tier, { limit: 1000 });
    if (!result) return res.status(500).json({ error: 'Failed to compute tier metrics' });
    res.json(result);
  } catch (err) {
    log.error({ err }, 'Failed to fetch tier backtest');
    res.status(500).json({ error: 'Failed to fetch tier data' });
  }
});

/**
 * GET /api/tier/learning/principles
 * Active (non-superseded) learned principles.
 */
router.get('/api/tier/learning/principles', async (req, res) => {
  try {
    const learned = await learningCycle.fetchLearnedPrinciples({ limit: 20 });
    res.json({
      timestamp: new Date(),
      learned: learned.map((p) => ({
        principle:  p.principle,
        samples:    p.sample_count,
        confidence: Number(p.confidence),
        discovered_at: p.discovered_at,
      })),
    });
  } catch (err) {
    log.error({ err }, 'Failed to fetch learning principles');
    res.status(500).json({ error: 'Failed to fetch principles' });
  }
});

/**
 * POST /api/tier/waitlist/signup
 * Persist email + source, send welcome email. Idempotent on duplicate email.
 */
router.post('/api/tier/waitlist/signup', async (req, res) => {
  try {
    const { email, source = 'landing', referrer = null } = req.body || {};

    if (!email || typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    const normalized = email.trim();
    const { data, error } = await supabase
      .from('waitlist')
      .insert({ email: normalized, source, referrer })
      .select('id')
      .single();

    // 23505 = unique_violation → already on the waitlist. Treat as success.
    if (error && error.code !== '23505') {
      log.error({ err: error, email: normalized }, 'Waitlist insert failed');
      return res.status(500).json({ error: 'Signup failed' });
    }

    // Fire welcome email (non-blocking, best effort; logged to email_log).
    emailService.sendWelcomeEmail(normalized, 'Trader').catch(() => { /* logged inside */ });

    res.json({
      success: true,
      message: 'Welcome! Check your email for confirmation.',
      id: data?.id || null,
    });
  } catch (err) {
    log.error({ err }, 'Waitlist signup failed');
    res.status(500).json({ error: 'Signup failed' });
  }
});

/**
 * GET /api/tier/waitlist/count
 * Real count from the waitlist table (social proof).
 */
router.get('/api/tier/waitlist/count', async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('waitlist')
      .select('*', { count: 'exact', head: true })
      .is('unsubscribed_at', null);

    if (error) {
      log.error({ err: error }, 'Waitlist count failed');
      return res.status(500).json({ error: 'Failed to fetch count' });
    }

    res.json({
      waitlist_count: count || 0,
      trending: (count || 0) > 100,
    });
  } catch (err) {
    log.error({ err }, 'Failed to fetch waitlist count');
    res.status(500).json({ error: 'Failed to fetch count' });
  }
});

// ============== ADMIN ENDPOINTS ==============

/**
 * POST /api/tier/learning/run-cycle
 * Pulls outcomes from DB, generates proposals, queues the valid ones.
 */
router.post('/api/tier/learning/run-cycle', requireAdmin, async (req, res) => {
  try {
    const cycle = await learningCycle.runLearningCycle(); // no arg = fetch from DB
    res.json(cycle);
  } catch (err) {
    log.error({ err }, 'Learning cycle execution failed');
    res.status(500).json({ error: 'Cycle execution failed' });
  }
});

/**
 * GET /api/tier/learning/pending
 * Adjustments awaiting approval.
 */
router.get('/api/tier/learning/pending', requireAdmin, async (req, res) => {
  try {
    const pending = await learningCycle.fetchPendingAdjustments({ limit: 100 });
    res.json(pending);
  } catch (err) {
    log.error({ err }, 'Failed to fetch pending approvals');
    res.status(500).json({ error: 'Failed to fetch pending' });
  }
});

/**
 * POST /api/tier/learning/approve/:id
 */
router.post('/api/tier/learning/approve/:id', requireAdmin, async (req, res) => {
  try {
    const approver = req.headers['x-admin-key'] ? 'admin' : 'unknown';
    const row = await learningCycle.approveQueuedAdjustment(req.params.id, approver);
    if (!row) return res.status(404).json({ error: 'Adjustment not found or not pending' });
    res.json(row);
  } catch (err) {
    log.error({ err }, 'Approval failed');
    res.status(500).json({ error: 'Approval failed' });
  }
});

/**
 * POST /api/tier/learning/reject/:id
 */
router.post('/api/tier/learning/reject/:id', requireAdmin, async (req, res) => {
  try {
    const reason = req.body?.reason || 'No reason provided';
    const row = await learningCycle.rejectQueuedAdjustment(req.params.id, reason);
    if (!row) return res.status(404).json({ error: 'Adjustment not found or not pending' });
    res.json(row);
  } catch (err) {
    log.error({ err }, 'Rejection failed');
    res.status(500).json({ error: 'Rejection failed' });
  }
});

/**
 * POST /api/tier/learning/rollback/:id
 * Reverses an applied adjustment; preserves audit trail via rolled_back_from_id.
 */
router.post('/api/tier/learning/rollback/:id', requireAdmin, async (req, res) => {
  try {
    const row = await learningCycle.rollbackQueuedAdjustment(req.params.id);
    if (!row) return res.status(404).json({ error: 'Adjustment not found' });
    res.json(row);
  } catch (err) {
    log.error({ err }, 'Rollback failed');
    res.status(500).json({ error: 'Rollback failed' });
  }
});

/**
 * GET /api/tier/learning/history
 * All non-pending adjustments (applied, rejected, rolled back).
 */
router.get('/api/tier/learning/history', requireAdmin, async (req, res) => {
  try {
    const history = await learningCycle.fetchAdjustmentHistory({ limit: 200 });
    res.json(history);
  } catch (err) {
    log.error({ err }, 'Failed to fetch history');
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

module.exports = router;
