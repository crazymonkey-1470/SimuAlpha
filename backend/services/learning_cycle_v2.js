/**
 * learning_cycle_v2.js
 * 
 * Self-improving system
 * - Tracks signal outcomes
 * - Calculates factor accuracy
 * - Proposes weight adjustments
 * - Safety guardrails: ±10% max, 30+ outcomes minimum, human approval required
 */

const log = require('./logger').child({ module: 'learning_cycle_v2' });

class LearningCycleV2 {
  constructor() {
    this.minOutcomesRequired = 30;
    this.maxWeightChange = 0.10; // ±10%
    this.minAccuracyThreshold = 0.50; // 50% accuracy threshold
  }

  /**
   * Track signal outcome
   * Records: signal_id, tier, entry, exit, return, actual_outcome
   */
  recordSignalOutcome(signalId, tier, entryPrice, exitPrice, holdDays) {
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
        recorded_at: new Date()
      };
    } catch (err) {
      log.error({ err }, 'Failed to record signal outcome');
      return null;
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
   * Apply approved adjustment
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
   * Rollback adjustment
   * If accuracy drops post-application
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

  /**
   * Run full learning cycle
   * 1. Collect recent outcomes
   * 2. Calculate accuracy for each factor
   * 3. Propose adjustments
   * 4. Return for human approval
   */
  async runLearningCycle(outcomes) {
    try {
      const proposals = [];

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
            
            proposals.push({
              ...proposal,
              validation
            });
          }
        }
      }

      return {
        cycle_run_at: new Date(),
        total_outcomes_analyzed: outcomes.length,
        proposals,
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
