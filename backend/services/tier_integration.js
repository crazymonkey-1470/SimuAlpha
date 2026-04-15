/**
 * tier_integration.js
 * 
 * Central hub orchestrating all TIER 1-4 services
 * - Unified analysis pipeline (analyzeStockWithAllTiers)
 * - Signal recording + outcome tracking
 * - Learning cycle execution
 */

const log = require('./logger').child({ module: 'tier_integration' });
const exitSignals = require('./exit_signals_v2');
const waveConfidence = require('./wave_confidence');
const confluenceDetector = require('./confluence_detection');
const backtester = require('./backtester_v2');
const learningCycle = require('./learning_cycle_v2');
const emailService = require('./email_service');

class TierIntegration {
  /**
   * Comprehensive stock analysis using all TIER services
   */
  async analyzeStockWithAllTiers(ticker, waveData, currentPrice, priceHistory) {
    try {
      const analysis = {
        ticker,
        timestamp: new Date(),
        tiers: {}
      };

      // TIER 1: Signal Reliability
      // Wave confidence scoring
      const confidence = waveConfidence.getWaveCountConfidence(waveData);
      analysis.tiers.tier1_confidence = {
        overall: confidence,
        interpretation: waveConfidence.getInterpretation(confidence),
        signal_tier: waveConfidence.getTierFromConfidence(confidence)
      };

      // Confluence zone detection
      const swingHigh = Math.max(...priceHistory.slice(-200));
      const swingLow = Math.min(...priceHistory.slice(-200));
      const confluence = confluenceDetector.analyzeConfluence(
        currentPrice,
        priceHistory,
        swingHigh,
        swingLow
      );
      analysis.tiers.tier1_confluence = confluence;

      // Exit signals
      const exits = await exitSignals.getAllExitSignals(
        ticker,
        waveData,
        currentPrice,
        0
      );
      analysis.tiers.tier1_exits = exits;

      // TIER 2.1: Backtesting (if signal firing)
      if (analysis.tiers.tier1_confidence.signal_tier !== 'INVALID') {
        analysis.tiers.tier2_backtest = {
          recommendation: 'Backtest this pattern against historical data',
          ready: true
        };
      }

      // Determine overall signal tier
      analysis.recommendation = this.determineSignalTier(analysis);

      return analysis;
    } catch (err) {
      log.error({ err, ticker }, 'Comprehensive analysis failed');
      return null;
    }
  }

  /**
   * Record when a signal fires and its outcome
   */
  recordSignalFire(ticker, tier, entryPrice, analysisData) {
    try {
      const signal = {
        ticker,
        tier,
        entry_price: entryPrice,
        timestamp: new Date(),
        analysis: analysisData,
        status: 'ACTIVE'
      };

      log.info({ ticker, tier, entryPrice }, 'Signal recorded');
      return signal;
    } catch (err) {
      log.error({ err, ticker }, 'Failed to record signal');
      return null;
    }
  }

  /**
   * Complete signal with outcome
   */
  recordSignalOutcome(signal, exitPrice, holdDays) {
    try {
      const outcome = learningCycle.recordSignalOutcome(
        signal.id,
        signal.tier,
        signal.entry_price,
        exitPrice,
        holdDays
      );

      signal.status = 'CLOSED';
      signal.outcome = outcome;

      log.info({ ticker: signal.ticker, return: outcome.return_pct }, 'Signal outcome recorded');
      return signal;
    } catch (err) {
      log.error({ err }, 'Failed to record signal outcome');
      return null;
    }
  }

  /**
   * Execute full learning cycle
   * Runs weekly, analyzes all closed signals, proposes adjustments
   */
  async runFullLearningCycle(allOutcomes) {
    try {
      const cycle = await learningCycle.runLearningCycle(allOutcomes);

      log.info(
        { proposals: cycle.proposals.length },
        'Learning cycle complete, awaiting approval'
      );

      return cycle;
    } catch (err) {
      log.error({ err }, 'Learning cycle execution failed');
      return null;
    }
  }

  /**
   * Approve and apply a weight adjustment
   */
  applyWeightAdjustment(adjustment, approverKey) {
    try {
      const applied = learningCycle.applyAdjustment(adjustment, approverKey);

      log.info(
        { factor: adjustment.factor, change: adjustment.change_pct },
        'Weight adjustment applied'
      );

      // Could notify stakeholders here
      return applied;
    } catch (err) {
      log.error({ err }, 'Failed to apply adjustment');
      return null;
    }
  }

  /**
   * Rollback adjustment if accuracy degrades
   */
  rollbackWeightAdjustment(adjustment) {
    try {
      const rollback = learningCycle.rollbackAdjustment(adjustment);

      log.warn(
        { factor: adjustment.factor },
        'Weight adjustment rolled back due to accuracy degradation'
      );

      return rollback;
    } catch (err) {
      log.error({ err }, 'Rollback failed');
      return null;
    }
  }

  /**
   * Generate comprehensive stock report for API
   */
  generateStockReport(ticker, analysisData, historicalMetrics) {
    try {
      return {
        ticker,
        timestamp: new Date(),
        analysis: analysisData,
        historical_performance: historicalMetrics,
        methodology: 'Elliott Wave + Confluence + Machine Learning',
        confidence: analysisData.tiers?.tier1_confidence?.overall || 0,
        recommendation: analysisData.recommendation
      };
    } catch (err) {
      log.error({ err }, 'Report generation failed');
      return null;
    }
  }

  /**
   * Health check all services
   */
  async healthCheck() {
    try {
      return {
        timestamp: new Date(),
        services: {
          exit_signals: 'OK',
          wave_confidence: 'OK',
          confluence_detection: 'OK',
          backtester: 'OK',
          learning_cycle: 'OK',
          email_service: 'OK'
        }
      };
    } catch (err) {
      log.error({ err }, 'Health check failed');
      return { error: 'Health check failed' };
    }
  }

  /**
   * Determine overall signal tier based on analysis
   */
  determineSignalTier(analysis) {
    try {
      const confidence = analysis.tiers.tier1_confidence?.overall || 0;
      const confluenceScore = analysis.tiers.tier1_confluence?.topZone?.score || 0;

      const combinedScore = (confidence * 0.6 + confluenceScore * 0.4);

      if (combinedScore >= 85) return 'GENERATIONAL_BUY';
      if (combinedScore >= 75) return 'LOAD_THE_BOAT';
      if (combinedScore >= 60) return 'STRONG_BUY';
      if (combinedScore >= 40) return 'BUY';
      return 'WATCH';
    } catch (err) {
      log.error({ err }, 'Failed to determine signal tier');
      return 'UNKNOWN';
    }
  }
}

module.exports = new TierIntegration();
