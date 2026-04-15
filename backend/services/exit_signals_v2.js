/**
 * exit_signals_v2.js
 * 
 * Elliott Wave exit signal detection
 * - Wave 5 exhaustion detection
 * - ABC correction completion signals
 * - Wave B rejection detection
 * - Re-entry signal identification
 */

const log = require('./logger').child({ module: 'exit_signals_v2' });

class ExitSignalDetector {
  constructor() {
    // Fibonacci levels
    this.fib = {
      retracement: [0.236, 0.382, 0.5, 0.618, 0.65, 0.786],
      extension: [1.618, 2.0, 2.618]
    };
  }

  /**
   * Detect if Wave 5 is exhausted (exit signal)
   * Checks: price near Fib extensions, volume declining, momentum divergence
   */
  detectWave5Exhaustion(waveData, currentPrice, volume) {
    try {
      if (!waveData || !waveData.wave5 || !waveData.wave1) {
        return null;
      }

      const wave1Length = Math.abs(waveData.wave1.end - waveData.wave1.start);
      const wave5Start = waveData.wave5.start;
      const wave5Length = currentPrice - wave5Start;

      // Calculate Fibonacci targets for Wave 5
      const targets = {
        fib100: wave5Start + (wave1Length * 1.0),
        fib161: wave5Start + (wave1Length * 1.618),
        fib261: wave5Start + (wave1Length * 2.618)
      };

      // Check if price is near exhaustion levels
      const nearTarget = Object.values(targets).some(
        t => Math.abs(currentPrice - t) / currentPrice < 0.02 // within 2%
      );

      if (!nearTarget) {
        return null;
      }

      // Check volume decline (exhaustion marker)
      const volumeDecline = waveData.wave5.avgVolume && 
        volume < waveData.wave5.avgVolume * 0.8;

      // Confidence score
      const confidence = (
        (nearTarget ? 0.4 : 0) +
        (volumeDecline ? 0.3 : 0) +
        (waveData.wave5.duration > 20 ? 0.3 : 0) // longer waves more likely exhausted
      );

      if (confidence < 0.6) {
        return null;
      }

      return {
        type: 'WAVE_5_EXHAUSTION',
        confidence: Math.min(confidence, 1.0),
        estimatedTarget: targets,
        volumeSignal: volumeDecline,
        recommendation: 'Consider taking profits or tightening stops',
        timestamp: new Date()
      };
    } catch (err) {
      log.error({ err, waveData }, 'Wave 5 exhaustion detection failed');
      return null;
    }
  }

  /**
   * Detect ABC correction completion (re-entry signal)
   * Wave C should reach 0.618 or 1.0 extension of Wave A
   */
  detectABCCompletion(correctionData, currentPrice) {
    try {
      if (!correctionData || !correctionData.waveA || !correctionData.waveC) {
        return null;
      }

      const waveALength = Math.abs(correctionData.waveA.end - correctionData.waveA.start);
      const waveAOrigin = correctionData.waveA.start;

      // Wave C targets
      const targets = {
        fib050: waveAOrigin - (waveALength * 0.5),
        fib618: waveAOrigin - (waveALength * 0.618),
        fib100: waveAOrigin - (waveALength * 1.0)
      };

      // Check if Wave C has completed
      const completedAtTarget = Object.entries(targets).some(
        ([key, level]) => {
          const diff = Math.abs(currentPrice - level) / currentPrice;
          return diff < 0.01; // within 1%
        }
      );

      if (!completedAtTarget) {
        return null;
      }

      // Validate Wave B didn't exceed 100% of Wave A (essential rule)
      const waveBRetrace = Math.abs(
        (correctionData.waveB.end - correctionData.waveA.start) / waveALength
      );

      if (waveBRetrace > 1.0) {
        return null; // Invalid correction pattern
      }

      const confidence = (
        (completedAtTarget ? 0.5 : 0) +
        (waveBRetrace <= 0.618 ? 0.3 : 0.15) + // fuller corrections are more reliable
        (correctionData.waveC.duration > 15 ? 0.2 : 0) // longer wave C = more mature
      );

      if (confidence < 0.6) {
        return null;
      }

      return {
        type: 'ABC_COMPLETION',
        confidence: Math.min(confidence, 1.0),
        waveALength,
        estimatedTarget: targets,
        waveABRatio: waveBRetrace,
        recommendation: 'Correction complete. Impulse wave likely resuming',
        timestamp: new Date()
      };
    } catch (err) {
      log.error({ err, correctionData }, 'ABC completion detection failed');
      return null;
    }
  }

  /**
   * Detect Wave B rejection (continuation of correction)
   * Wave B bounces near prior highs but fails to exceed them
   */
  detectWaveBRejection(waveData, currentPrice, priorHighs) {
    try {
      if (!waveData || !waveData.waveA || !waveData.waveB) {
        return null;
      }

      // Wave B should retrace 90-100% of Wave A
      const waveALength = Math.abs(waveData.waveA.end - waveData.waveA.start);
      const waveBRetrace = Math.abs(
        (waveData.waveB.end - waveData.waveA.start) / waveALength
      );

      if (waveBRetrace < 0.9 || waveBRetrace > 1.05) {
        return null; // Not a valid flat correction pattern
      }

      // Check if price is near the retracement level but rejected
      const nearRetraceLevel = Math.abs(
        currentPrice - waveData.waveB.end
      ) / currentPrice < 0.02;

      if (!nearRetraceLevel) {
        return null;
      }

      // Validate prior highs for double-top pattern
      const nearPriorHigh = priorHighs && priorHighs.some(
        high => Math.abs(currentPrice - high) / currentPrice < 0.02
      );

      const confidence = (
        (waveBRetrace >= 0.95 ? 0.4 : 0.2) +
        (nearPriorHigh ? 0.3 : 0.1) +
        (waveData.waveB.duration > 10 ? 0.3 : 0)
      );

      if (confidence < 0.5) {
        return null;
      }

      return {
        type: 'WAVE_B_REJECTION',
        confidence: Math.min(confidence, 1.0),
        waveABRatio: waveBRetrace,
        doubleTopConfirmed: nearPriorHigh,
        nextTarget: waveData.waveA.start - (waveALength * 0.618), // Wave C target
        recommendation: 'Wave B rejected. Wave C likely to push lower',
        timestamp: new Date()
      };
    } catch (err) {
      log.error({ err, waveData }, 'Wave B rejection detection failed');
      return null;
    }
  }

  /**
   * Identify re-entry signals after correction
   * When correction completes at confluence level with strong confirmation
   */
  detectReentrySignal(correctionData, confluenceLevel, volumeChange) {
    try {
      if (!correctionData || !confluenceLevel) {
        return null;
      }

      // Correction should complete within 1% of confluence level
      const atConfluence = Math.abs(
        confluenceLevel - correctionData.completionPrice
      ) / confluenceLevel < 0.01;

      if (!atConfluence) {
        return null;
      }

      // Volume should increase on bounce (buying pressure)
      const volumeConfirm = volumeChange && volumeChange > 1.2; // 20% increase

      const confidence = (
        (atConfluence ? 0.4 : 0) +
        (volumeConfirm ? 0.3 : 0.1) +
        (correctionData.waveC.completed ? 0.3 : 0)
      );

      if (confidence < 0.6) {
        return null;
      }

      return {
        type: 'REENTRY_SIGNAL',
        confidence: Math.min(confidence, 1.0),
        confluenceLevel,
        volumeConfirmed: volumeConfirm,
        recommendation: 'Strong re-entry signal. Wave 1 of new impulse starting',
        entryZone: {
          low: confluenceLevel * 0.99,
          high: confluenceLevel * 1.01
        },
        timestamp: new Date()
      };
    } catch (err) {
      log.error({ err }, 'Re-entry signal detection failed');
      return null;
    }
  }

  /**
   * Get all exit signals for a ticker
   */
  async getAllExitSignals(ticker, waveData, currentPrice, volume) {
    try {
      const signals = [];

      const wave5 = this.detectWave5Exhaustion(waveData, currentPrice, volume);
      if (wave5) signals.push(wave5);

      const abcComplete = this.detectABCCompletion(waveData, currentPrice);
      if (abcComplete) signals.push(abcComplete);

      const waveBReject = this.detectWaveBRejection(waveData, currentPrice);
      if (waveBReject) signals.push(waveBReject);

      return signals;
    } catch (err) {
      log.error({ err, ticker }, 'Get all exit signals failed');
      return [];
    }
  }
}

module.exports = new ExitSignalDetector();
