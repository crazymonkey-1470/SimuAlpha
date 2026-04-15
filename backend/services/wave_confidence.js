/**
 * wave_confidence.js
 * 
 * Dynamic Elliott Wave confidence scoring (0-100)
 * Evaluates:
 * - Fibonacci alignment (retracement ratios)
 * - Rule validation (Wave 2/3/4 rules)
 * - Pattern completion stage
 * - Institutional confluence
 */

const log = require('./logger').child({ module: 'wave_confidence' });

class WaveConfidenceScorer {
  constructor() {
    this.fibRetracement = [0.236, 0.382, 0.5, 0.618, 0.65, 0.786];
    this.fibExtension = [1.618, 2.0, 2.618];
  }

  /**
   * Score Wave 2 retracement
   * Rules: Must be 23.6% - 100% of Wave 1, never more
   * Best: 50% - 61.8%
   */
  scoreWave2Retrace(wave1Length, wave2RetracePct) {
    let score = 0;

    // Must be valid (0.236 - 1.0)
    if (wave2RetracePct < 0.236 || wave2RetracePct > 1.0) {
      return 0; // Invalid wave count
    }

    // Perfect Fib zones get full points
    if (wave2RetracePct >= 0.5 && wave2RetracePct <= 0.618) {
      score = 40; // 0.5-0.618 is ideal
    } else if (wave2RetracePct >= 0.382 && wave2RetracePct < 0.5) {
      score = 30; // 0.382-0.5 is good
    } else if (wave2RetracePct >= 0.618 && wave2RetracePct <= 0.786) {
      score = 25; // 0.618-0.786 is acceptable but risky
    } else if (wave2RetracePct < 0.382) {
      score = 15; // Shallow retraces are weak
    } else {
      score = 10; // Close to 1.0 is breakage risk
    }

    return score;
  }

  /**
   * Score Wave 3 strength
   * Rules: NEVER shortest of 1,3,5. Usually longest.
   * Targets: 1.618x to 2.618x Wave 1
   */
  scoreWave3Strength(wave1Length, wave3Length) {
    let score = 0;

    const ratio = wave3Length / wave1Length;

    // Check extension targets
    if (ratio >= 1.618 && ratio <= 2.618) {
      score = 40; // Perfect target zone
    } else if (ratio >= 1.5 && ratio < 1.618) {
      score = 35; // Near lower target
    } else if (ratio > 2.618 && ratio < 3.0) {
      score = 30; // Extended wave
    } else if (ratio >= 1.0 && ratio < 1.5) {
      score = 20; // Below target but valid
    } else if (ratio < 1.0) {
      score = 5; // Too short, likely miscounted
    }

    return score;
  }

  /**
   * Score Wave 4 correction
   * Rules: 
   * - Must not enter Wave 2 territory
   * - Cannot retrace > 38.2% of Wave 3
   * - Best: 23.6% - 38.2% retrace
   */
  scoreWave4Correction(wave2Start, wave3Length, wave4RetracePct) {
    let score = 0;

    // Must be within limits
    if (wave4RetracePct > 0.382) {
      return 5; // Too deep, invalidates count
    }

    if (wave4RetracePct >= 0.236 && wave4RetracePct <= 0.382) {
      score = 35; // Perfect range
    } else if (wave4RetracePct < 0.236) {
      score = 25; // Shallow but valid
    }

    return score;
  }

  /**
   * Score Wave 5 completion
   * Rules: Can be any length from 0.236 to 2.618x Wave 1
   * Best: 1.0x to 1.618x Wave 1
   */
  scoreWave5Completion(wave1Length, wave5Length) {
    let score = 0;

    const ratio = wave5Length / wave1Length;

    // Valid range check
    if (ratio < 0.236 || ratio > 2.618) {
      return 5; // Outside valid range
    }

    // Scoring
    if (ratio >= 1.0 && ratio <= 1.618) {
      score = 40; // Perfect completion zone
    } else if (ratio >= 0.618 && ratio < 1.0) {
      score = 30; // Moderate completion
    } else if (ratio >= 1.618 && ratio <= 2.0) {
      score = 30; // Extended but valid
    } else if (ratio >= 0.236 && ratio < 0.618) {
      score = 15; // Very short, weak
    } else {
      score = 10; // Extended beyond normal
    }

    return score;
  }

  /**
   * Score ABC correction pattern
   * Wave A: 5 waves
   * Wave B: 3 waves, 90-100% retrace of Wave A
   * Wave C: 5 waves, reaches 0.618-1.0 extension of Wave A
   */
  scoreABCPattern(waveA, waveB, waveC, waveALength) {
    let score = 0;

    // Wave B retrace validation
    const waveBRetrace = Math.abs(waveB.end - waveA.start) / waveALength;

    if (waveBRetrace < 0.9) {
      return 10; // Too shallow, not a correction
    }

    if (waveBRetrace > 1.0) {
      return 5; // Exceeded Wave A, broken pattern
    }

    // Ideal retrace range
    if (waveBRetrace >= 0.95 && waveBRetrace <= 1.0) {
      score += 25;
    } else if (waveBRetrace >= 0.9 && waveBRetrace < 0.95) {
      score += 20;
    }

    // Wave C target validation
    const waveCRatio = Math.abs(waveC.end - waveA.start) / waveALength;

    if (waveCRatio >= 0.618 && waveCRatio <= 1.0) {
      score += 30; // Perfect target
    } else if (waveCRatio >= 0.5 && waveCRatio < 0.618) {
      score += 20; // Shallow
    } else if (waveCRatio > 1.0 && waveCRatio < 1.618) {
      score += 15; // Extended
    }

    // Duration validation (longer = more mature)
    if (waveC.duration && waveC.duration > 15) {
      score += 15;
    } else if (waveC.duration && waveC.duration > 10) {
      score += 10;
    }

    return Math.min(score, 100);
  }

  /**
   * Overall wave count confidence score
   * Combines all validations into single 0-100 score
   */
  getWaveCountConfidence(waveData) {
    try {
      if (!waveData || !waveData.wave1) {
        return 0;
      }

      let totalScore = 0;
      let weights = {
        wave2: 0.15,
        wave3: 0.25,
        wave4: 0.15,
        wave5: 0.20,
        pattern: 0.25
      };

      // Wave 2 score
      if (waveData.wave2) {
        const w1Length = Math.abs(waveData.wave1.end - waveData.wave1.start);
        const w2Retrace = Math.abs(
          (waveData.wave2.end - waveData.wave1.start) / w1Length
        );
        const wave2Score = this.scoreWave2Retrace(w1Length, w2Retrace);
        totalScore += wave2Score * weights.wave2;
      }

      // Wave 3 score
      if (waveData.wave3) {
        const w1Length = Math.abs(waveData.wave1.end - waveData.wave1.start);
        const w3Length = Math.abs(waveData.wave3.end - waveData.wave3.start);
        const wave3Score = this.scoreWave3Strength(w1Length, w3Length);
        totalScore += wave3Score * weights.wave3;
      }

      // Wave 4 score
      if (waveData.wave4) {
        const w1Length = Math.abs(waveData.wave1.end - waveData.wave1.start);
        const w3Length = Math.abs(waveData.wave3.end - waveData.wave3.start);
        const w4Retrace = Math.abs(
          (waveData.wave4.end - waveData.wave3.end) / w3Length
        );
        const wave4Score = this.scoreWave4Correction(
          waveData.wave2.start,
          w3Length,
          w4Retrace
        );
        totalScore += wave4Score * weights.wave4;
      }

      // Wave 5 score
      if (waveData.wave5) {
        const w1Length = Math.abs(waveData.wave1.end - waveData.wave1.start);
        const w5Length = Math.abs(waveData.wave5.end - waveData.wave5.start);
        const wave5Score = this.scoreWave5Completion(w1Length, w5Length);
        totalScore += wave5Score * weights.wave5;
      }

      // Pattern score (correction vs impulse)
      let patternScore = 50; // Default
      if (waveData.waveA && waveData.waveB && waveData.waveC) {
        const w1Length = Math.abs(waveData.waveA.end - waveData.waveA.start);
        patternScore = this.scoreABCPattern(
          waveData.waveA,
          waveData.waveB,
          waveData.waveC,
          w1Length
        );
      }
      totalScore += patternScore * weights.pattern;

      return Math.round(totalScore);
    } catch (err) {
      log.error({ err, waveData }, 'Wave confidence scoring failed');
      return 0;
    }
  }

  /**
   * Get confidence details with breakdown
   */
  getConfidenceDetails(waveData) {
    try {
      const overall = this.getWaveCountConfidence(waveData);

      return {
        overall,
        interpretation: this.getInterpretation(overall),
        signal_tier: this.getTierFromConfidence(overall),
        details: {
          wave2: waveData.wave2 ? 'Present' : 'Missing',
          wave3: waveData.wave3 ? 'Present' : 'Missing',
          wave4: waveData.wave4 ? 'Present' : 'Missing',
          wave5: waveData.wave5 ? 'Present' : 'Missing'
        }
      };
    } catch (err) {
      log.error({ err }, 'Get confidence details failed');
      return { overall: 0, interpretation: 'Error', signal_tier: 'INVALID' };
    }
  }

  getInterpretation(score) {
    if (score >= 85) return 'Excellent wave structure';
    if (score >= 70) return 'Good wave structure';
    if (score >= 50) return 'Acceptable wave structure';
    if (score >= 30) return 'Questionable wave structure';
    return 'Invalid wave count';
  }

  getTierFromConfidence(score) {
    if (score >= 85) return 'GENERATIONAL_BUY';
    if (score >= 75) return 'LOAD_THE_BOAT';
    if (score >= 60) return 'STRONG_BUY';
    if (score >= 40) return 'BUY';
    return 'WATCH';
  }
}

module.exports = new WaveConfidenceScorer();
