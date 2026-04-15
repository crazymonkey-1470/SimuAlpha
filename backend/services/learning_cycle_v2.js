/**
 * learning_cycle_v2.js
 *
 * Self-improving system
 * - Tracks signal outcomes (signal_outcomes table)
 * - Calculates factor accuracy
 * - Proposes weight adjustments (weight_adjustment_queue table)
 * - Safety guardrails: ±10% max, 30+ outcomes minimum, human approval required
 */

const log      = require('./logger').child({ module: 'learning_cycle_v2' });
const supabase = require('./supabase');

const OUTCOMES_TABLE   = 'signal_outcomes';
const QUEUE_TABLE      = 'weight_adjustment_queue';
const PRINCIPLES_TABLE = 'learned_principles';

class LearningCycleV2 {
  constructor() {
    this.minOutcomesRequired = 30;
    this.maxWeightChange = 0.10; // ±10%
    this.minAccuracyThreshold = 0.50; // 50% accuracy threshold
  }

  /**
   * Build a signal outcome row (pure — no DB side effect). Preserved for
   * callers that want the shape without persisting.
   */
  recordSignalOutcome(signalId, tier, entryPrice, exitPrice, holdDays, extra = {}) {
    try {
      const returnPct = ((exitPrice - entryPrice) / entryPrice) * 100;
      const success = returnPct > 0;

      return {
        signal_id: signalId,
        tier,
        entry_price: entryPrice,
        exit_price: exitPrice,
        return_pct: returnPct,
        success,
        hold_days: holdDays,
        ticker: extra.ticker || null,
        factor: extra.factor || null,
        factors: extra.factors || [],
        recorded_at: new Date()
      };
    } catch (err) {
      log.error({ err }, 'Failed to record signal outcome');
      return null;
    }
  }

  /**
   * Persist a signal outcome to `signal_outcomes`. Returns inserted id or null.
   */
  async saveSignalOutcome({
    signal_id   = null,
    ticker,
    tier,
    entry_price,
    exit_price,
    hold_days,
    factor      = null,
    factors     = [],
  }) {
    try {
      if (!ticker || !tier || entry_price == null || exit_price == null) {
        log.warn({ ticker, tier }, 'saveSignalOutcome: missing required fields');
        return null;
      }
      const return_pct = ((exit_price - entry_price) / entry_price) * 100;
      const success    = return_pct > 0;

      const { data, error } = await supabase
        .from(OUTCOMES_TABLE)
        .insert({
          signal_id,
          ticker,
          tier,
          entry_price,
          exit_price,
          return_pct,
          success,
          hold_days,
          factor,
          factors,
        })
        .select('id')
        .single();

      if (error) {
        log.error({ err: error, ticker }, 'saveSignalOutcome failed');
        return null;
      }
      return data?.id || null;
    } catch (err) {
      log.error({ err }, 'saveSignalOutcome exception');
      return null;
    }
  }

  /**
   * Fetch recent outcomes, optionally filtered by factor/tier.
   */
  async fetchRecentOutcomes({ factor = null, tier = null, limit = 1000 } = {}) {
    try {
      let q = supabase
        .from(OUTCOMES_TABLE)
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(limit);
      if (factor) q = q.eq('factor', factor);
      if (tier)   q = q.eq('tier', tier);
      const { data, error } = await q;
      if (error) {
        log.error({ err: error }, 'fetchRecentOutcomes failed');
        return [];
      }
      return data || [];
    } catch (err) {
      log.error({ err }, 'fetchRecentOutcomes exception');
      return [];
    }
  }

  /**
   * Calculate accuracy for a specific factor
   * Example: Wave 3 confluence → How often do signals work there?
   */
  calculateFactorAccuracy(outcomes, factorType) {
    try {
      if (!outcomes || outcomes.length < this.minOutcomesRequired) {
        return null; // Not enough data
      }

      // Filter outcomes by factor
      const matching = outcomes.filter(o => o.factor === factorType);

      if (matching.length < this.minOutcomesRequired) {
        return null; // Not enough specific outcomes
      }

      const successes = matching.filter(o => o.success).length;
      const accuracy = successes / matching.length;

      return {
        factor: factorType,
        accuracy: Math.round(accuracy * 10000) / 100,
        total_outcomes: matching.length,
        successes,
        failures: matching.length - successes
      };
    } catch (err) {
      log.error({ err }, 'Factor accuracy calculation failed');
      return null;
    }
  }

  /**
   * Propose weight adjustment
   * Based on factor accuracy vs baseline
   */
  proposeWeightAdjustment(currentWeight, factorAccuracy, baselineAccuracy = 0.65) {
    try {
      if (!factorAccuracy) {
        return null;
      }

      const improvementPct = (factorAccuracy.accuracy / 100) - baselineAccuracy;
      const maxChange = currentWeight * this.maxWeightChange;

      // Propose adjustment
      let proposedChange = improvementPct * currentWeight;
      
      // Cap to max change
      if (Math.abs(proposedChange) > Math.abs(maxChange)) {
        proposedChange = maxChange * Math.sign(proposedChange);
      }

      const newWeight = currentWeight + proposedChange;

      return {
        factor: factorAccuracy.factor,
        current_weight: currentWeight,
        proposed_change: Math.round(proposedChange * 10000) / 10000,
        new_weight: Math.round(newWeight * 10000) / 10000,
        change_pct: Math.round((proposedChange / currentWeight) * 10000) / 100,
        basis: {
          observed_accuracy: factorAccuracy.accuracy,
          baseline_accuracy: baselineAccuracy * 100,
          sample_size: factorAccuracy.total_outcomes,
          successes: factorAccuracy.successes
        },
        status: 'PENDING_APPROVAL'
      };
    } catch (err) {
      log.error({ err }, 'Weight adjustment proposal failed');
      return null;
    }
  }

  /**
   * Validate proposed adjustment
   * Ensures: min outcomes met, change within limits, accuracy above threshold
   */
  validateAdjustment(adjustment) {
    try {
      const errors = [];

      // Check sample size
      if (adjustment.basis.sample_size < this.minOutcomesRequired) {
        errors.push(`Insufficient outcomes: ${adjustment.basis.sample_size} < ${this.minOutcomesRequired}`);
      }

      // Check change limit
      if (Math.abs(adjustment.change_pct) > 10) {
        errors.push(`Change exceeds limit: ${adjustment.change_pct}% > 10%`);
      }

      // Check accuracy threshold
      if (adjustment.basis.observed_accuracy < this.minAccuracyThreshold * 100) {
        errors.push(`Accuracy below threshold: ${adjustment.basis.observed_accuracy}% < ${this.minAccuracyThreshold * 100}%`);
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings: this.generateWarnings(adjustment)
      };
    } catch (err) {
      log.error({ err }, 'Adjustment validation failed');
      return { valid: false, errors: ['Validation error'] };
    }
  }

  generateWarnings(adjustment) {
    const warnings = [];

    if (adjustment.new_weight > 1.0) {
      warnings.push('New weight exceeds 1.0 (full weight)');
    }

    if (adjustment.new_weight < 0.1) {
      warnings.push('New weight very low, factor may be disabled');
    }

    if (adjustment.change_pct > 5) {
      warnings.push(`Large adjustment: ${adjustment.change_pct}%`);
    }

    return warnings;
  }

  /**
   * Apply approved adjustment (pure shape — DB side in applyPendingAdjustment).
   */
  applyAdjustment(adjustment, approverKey) {
    try {
      if (!adjustment || adjustment.status !== 'APPROVED') {
        return null;
      }

      return {
        ...adjustment,
        status: 'APPLIED',
        applied_at: new Date(),
        applied_by: approverKey
      };
    } catch (err) {
      log.error({ err }, 'Failed to apply adjustment');
      return null;
    }
  }

  /**
   * Rollback adjustment shape (pure). Use rollbackQueuedAdjustment for DB path.
   */
  rollbackAdjustment(appliedAdjustment) {
    try {
      return {
        factor: appliedAdjustment.factor,
        previous_weight: appliedAdjustment.new_weight,
        restored_weight: appliedAdjustment.current_weight,
        reason: 'accuracy_degradation',
        rolled_back_at: new Date(),
        original_applied_at: appliedAdjustment.applied_at
      };
    } catch (err) {
      log.error({ err }, 'Failed to rollback adjustment');
      return null;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // Persistence: weight_adjustment_queue
  // ══════════════════════════════════════════════════════════════

  /**
   * Queue a proposed adjustment for human approval.
   * Maps the in-memory proposal shape onto the DB schema.
   */
  async queueAdjustment(proposal) {
    try {
      if (!proposal || !proposal.factor) return null;

      const row = {
        factor:          proposal.factor,
        current_weight:  proposal.current_weight,
        proposed_weight: proposal.new_weight,
        change_pct:      proposal.change_pct,
        status:          'PENDING_APPROVAL',
        basis_json:      proposal.basis || {},
      };

      const { data, error } = await supabase
        .from(QUEUE_TABLE)
        .insert(row)
        .select('id')
        .single();

      if (error) {
        log.error({ err: error, factor: proposal.factor }, 'queueAdjustment failed');
        return null;
      }
      return data?.id || null;
    } catch (err) {
      log.error({ err }, 'queueAdjustment exception');
      return null;
    }
  }

  /**
   * Fetch pending adjustments for admin review.
   */
  async fetchPendingAdjustments({ limit = 100 } = {}) {
    try {
      const { data, error } = await supabase
        .from(QUEUE_TABLE)
        .select('*')
        .eq('status', 'PENDING_APPROVAL')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) {
        log.error({ err: error }, 'fetchPendingAdjustments failed');
        return [];
      }
      return data || [];
    } catch (err) {
      log.error({ err }, 'fetchPendingAdjustments exception');
      return [];
    }
  }

  /**
   * Approve a queued adjustment (sets APPROVED + applied_at/approved_at).
   */
  async approveQueuedAdjustment(id, approverKey) {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from(QUEUE_TABLE)
        .update({
          status:      'APPLIED',
          approved_by: approverKey,
          approved_at: now,
          applied_at:  now,
        })
        .eq('id', id)
        .in('status', ['PENDING_APPROVAL', 'APPROVED'])
        .select()
        .single();
      if (error) {
        log.error({ err: error, id }, 'approveQueuedAdjustment failed');
        return null;
      }
      return data;
    } catch (err) {
      log.error({ err, id }, 'approveQueuedAdjustment exception');
      return null;
    }
  }

  /**
   * Reject a queued adjustment.
   */
  async rejectQueuedAdjustment(id, reason) {
    try {
      const { data, error } = await supabase
        .from(QUEUE_TABLE)
        .update({
          status:          'REJECTED',
          rejected_reason: reason || null,
          rejected_at:     new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', 'PENDING_APPROVAL')
        .select()
        .single();
      if (error) {
        log.error({ err: error, id }, 'rejectQueuedAdjustment failed');
        return null;
      }
      return data;
    } catch (err) {
      log.error({ err, id }, 'rejectQueuedAdjustment exception');
      return null;
    }
  }

  /**
   * Roll back an applied adjustment. Inserts a reverse row linked via
   * rolled_back_from_id so the audit trail is preserved.
   */
  async rollbackQueuedAdjustment(id) {
    try {
      const { data: original, error: fetchErr } = await supabase
        .from(QUEUE_TABLE)
        .select('*')
        .eq('id', id)
        .single();
      if (fetchErr || !original) {
        log.error({ err: fetchErr, id }, 'rollbackQueuedAdjustment: not found');
        return null;
      }

      // 1. Mark the original as rolled back.
      const now = new Date().toISOString();
      await supabase
        .from(QUEUE_TABLE)
        .update({ status: 'ROLLED_BACK', rolled_back_at: now })
        .eq('id', id);

      // 2. Insert a reverse row (swap current/proposed) for audit.
      const { data: reverse, error: insErr } = await supabase
        .from(QUEUE_TABLE)
        .insert({
          factor:              original.factor,
          current_weight:      original.proposed_weight,
          proposed_weight:     original.current_weight,
          change_pct:          -Number(original.change_pct),
          status:              'APPLIED',
          basis_json:          { reason: 'rollback', original_id: id },
          rolled_back_from_id: id,
          applied_at:          now,
        })
        .select()
        .single();

      if (insErr) {
        log.error({ err: insErr, id }, 'rollbackQueuedAdjustment: reverse insert failed');
        return null;
      }
      return reverse;
    } catch (err) {
      log.error({ err, id }, 'rollbackQueuedAdjustment exception');
      return null;
    }
  }

  /**
   * Approval history (everything that's not PENDING).
   */
  async fetchAdjustmentHistory({ limit = 200 } = {}) {
    try {
      const { data, error } = await supabase
        .from(QUEUE_TABLE)
        .select('*')
        .neq('status', 'PENDING_APPROVAL')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) {
        log.error({ err: error }, 'fetchAdjustmentHistory failed');
        return [];
      }
      return data || [];
    } catch (err) {
      log.error({ err }, 'fetchAdjustmentHistory exception');
      return [];
    }
  }

  /**
   * Active learned principles for the public /principles endpoint.
   */
  async fetchLearnedPrinciples({ limit = 20 } = {}) {
    try {
      const { data, error } = await supabase
        .from(PRINCIPLES_TABLE)
        .select('principle, sample_count, confidence, discovered_at')
        .is('superseded_at', null)
        .order('discovered_at', { ascending: false })
        .limit(limit);
      if (error) {
        log.error({ err: error }, 'fetchLearnedPrinciples failed');
        return [];
      }
      return data || [];
    } catch (err) {
      log.error({ err }, 'fetchLearnedPrinciples exception');
      return [];
    }
  }

  /**
   * Run full learning cycle
   * 1. Collect recent outcomes (from DB if `outcomes` is omitted/empty)
   * 2. Calculate accuracy for each factor
   * 3. Propose adjustments
   * 4. Queue valid proposals for human approval
   * 5. Return summary
   */
  async runLearningCycle(outcomes) {
    try {
      // If caller didn't supply outcomes, pull from DB.
      if (!Array.isArray(outcomes) || outcomes.length === 0) {
        outcomes = await this.fetchRecentOutcomes({ limit: 5000 });
      }

      const proposals = [];
      const queued    = [];

      // Key factors to evaluate
      const factors = [
        'wave_3_confluence',
        'wave_2_retrace',
        'fibonacci_0618',
        'moving_average_200',
        'institutional_accumulation'
      ];

      for (const factor of factors) {
        const accuracy = this.calculateFactorAccuracy(outcomes, factor);
        
        if (accuracy) {
          // Current weight (would come from config)
          const currentWeight = 0.5; // default
          
          const proposal = this.proposeWeightAdjustment(currentWeight, accuracy);
          
          if (proposal) {
            const validation = this.validateAdjustment(proposal);
            const enriched   = { ...proposal, validation };
            proposals.push(enriched);

            // Only queue the valid ones — invalid proposals stay in the response
            // for visibility but never enter the approval queue.
            if (validation.valid) {
              const queueId = await this.queueAdjustment(proposal);
              if (queueId) queued.push({ id: queueId, factor: proposal.factor });
            }
          }
        }
      }

      return {
        cycle_run_at: new Date(),
        total_outcomes_analyzed: outcomes.length,
        proposals,
        queued,
        awaiting_approval: proposals.filter(p => p.status === 'PENDING_APPROVAL').length,
        summary: this.generateLearningSummary(proposals)
      };
    } catch (err) {
      log.error({ err }, 'Learning cycle failed');
      return null;
    }
  }

  generateLearningSummary(proposals) {
    const validProposals = proposals.filter(p => p.validation.valid);
    const improvedFactors = proposals.filter(
      p => p.proposed_change > 0 && p.validation.valid
    );
    const weakenedFactors = proposals.filter(
      p => p.proposed_change < 0 && p.validation.valid
    );

    return {
      total_proposals: proposals.length,
      valid_proposals: validProposals.length,
      factors_improving: improvedFactors.length,
      factors_weakening: weakenedFactors.length,
      key_findings: this.identifyKeyFindings(proposals)
    };
  }

  identifyKeyFindings(proposals) {
    const findings = [];

    // Find strongest factor
    const strongest = proposals.reduce((best, p) =>
      (!best || p.basis.observed_accuracy > best.basis.observed_accuracy) ? p : best
    );

    if (strongest) {
      findings.push(`${strongest.factor} is strongest (${strongest.basis.observed_accuracy}% accuracy)`);
    }

    // Find weakest factor
    const weakest = proposals.reduce((worst, p) =>
      (!worst || p.basis.observed_accuracy < worst.basis.observed_accuracy) ? p : worst
    );

    if (weakest && weakest.basis.observed_accuracy < 55) {
      findings.push(`${weakest.factor} underperforming (${weakest.basis.observed_accuracy}% accuracy)`);
    }

    return findings;
  }
}

module.exports = new LearningCycleV2();
