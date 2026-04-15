/**
 * confluence_detection.js
 * 
 * Institutional entry zone identification
 * Clusters multiple support/resistance signals:
 * - Fibonacci retracement levels
 * - Moving averages (50, 100, 200 SMA)
 * - Previous support/resistance zones
 * - Round numbers (psychological levels)
 * 
 * When 3+ signals align = institutional gridlock = high probability entry
 */

const log = require('./logger').child({ module: 'confluence_detection' });

class ConfluenceDetector {
  constructor() {
    this.fibLevels = [0.236, 0.382, 0.5, 0.618, 0.65, 0.786];
    this.tolerance = 0.02; // 2% tolerance for confluence
  }

  /**
   * Detect Fibonacci support/resistance levels
   * Based on previous swing high/low
   */
  detectFibonacciLevels(swingHigh, swingLow) {
    try {
      const range = swingHigh - swingLow;
      const levels = {};

      this.fibLevels.forEach(fib => {
        levels[`fib_${(fib * 100).toFixed(1)}`] = swingLow + (range * fib);
      });

      return levels;
    } catch (err) {
      log.error({ err }, 'Fibonacci level detection failed');
      return {};
    }
  }

  /**
   * Calculate moving average support
   * 50, 100, 200 SMA
   */
  detectMovingAverageLevels(prices) {
    try {
      const levels = {};

      // 50 SMA
      if (prices.length >= 50) {
        const sma50 = prices.slice(-50).reduce((a, b) => a + b) / 50;
        levels.sma_50 = sma50;
      }

      // 100 SMA
      if (prices.length >= 100) {
        const sma100 = prices.slice(-100).reduce((a, b) => a + b) / 100;
        levels.sma_100 = sma100;
      }

      // 200 SMA
      if (prices.length >= 200) {
        const sma200 = prices.slice(-200).reduce((a, b) => a + b) / 200;
        levels.sma_200 = sma200;
      }

      return levels;
    } catch (err) {
      log.error({ err }, 'Moving average level detection failed');
      return {};
    }
  }

  /**
   * Identify round number support levels
   * $10, $50, $100, $500, etc.
   */
  detectRoundNumberLevels(price) {
    try {
      const levels = {};
      const roundNumbers = [1, 5, 10, 25, 50, 100, 250, 500, 1000];

      // Find nearest round number below price
      for (const round of roundNumbers) {
        const lower = Math.floor(price / round) * round;
        const upper = lower + round;

        if (Math.abs(price - lower) < price * 0.05) {
          levels[`round_${lower}`] = lower;
        }
        if (Math.abs(price - upper) < price * 0.05) {
          levels[`round_${upper}`] = upper;
        }
      }

      return levels;
    } catch (err) {
      log.error({ err }, 'Round number level detection failed');
      return {};
    }
  }

  /**
   * Cluster all support/resistance signals
   * Returns zones where 3+ signals align
   */
  detectConfluenceZones(fibLevels, maLevels, roundNumbers, currentPrice) {
    try {
      // Combine all levels
      const allLevels = {
        ...fibLevels,
        ...maLevels,
        ...roundNumbers
      };

      const levelPrices = Object.values(allLevels);
      const clusters = [];

      // Group levels within tolerance range
      levelPrices.forEach(level => {
        const nearbyLevels = levelPrices.filter(
          other => Math.abs(level - other) < Math.abs(level * this.tolerance)
        );

        if (nearbyLevels.length >= 3) { // At least 3 signals needed
          const existingCluster = clusters.find(
            c => Math.abs(c.level - level) < Math.abs(level * this.tolerance)
          );

          if (!existingCluster) {
            clusters.push({
              level,
              strength: nearbyLevels.length,
              sources: this.getClusterSources(allLevels, level),
              distance: Math.abs(level - currentPrice) / currentPrice
            });
          }
        }
      });

      // Sort by strength
      return clusters.sort((a, b) => b.strength - a.strength);
    } catch (err) {
      log.error({ err }, 'Confluence zone detection failed');
      return [];
    }
  }

  /**
   * Identify which signals contribute to a confluence zone
   */
  getClusterSources(allLevels, targetLevel) {
    try {
      const sources = [];
      const tolerance = Math.abs(targetLevel * this.tolerance);

      Object.entries(allLevels).forEach(([name, level]) => {
        if (Math.abs(level - targetLevel) < tolerance) {
          sources.push(name);
        }
      });

      return sources;
    } catch (err) {
      log.warn({ err }, 'Failed to identify cluster sources');
      return [];
    }
  }

  /**
   * Score confluence zone quality
   * Factors:
   * - Signal count (3+ = strong, 5+ = institutional)
   * - Signal diversity (Fib + MA + round = better than just Fib)
   * - Distance from current price (nearby = more relevant)
   */
  scoreConfluenceZone(zone) {
    try {
      let score = 0;

      // Signal count (max 30 points)
      if (zone.strength >= 5) {
        score += 30;
      } else if (zone.strength >= 4) {
        score += 25;
      } else if (zone.strength >= 3) {
        score += 20;
      }

      // Signal diversity (max 30 points)
      const hasFib = zone.sources.some(s => s.startsWith('fib_'));
      const hasMA = zone.sources.some(s => s.startsWith('sma_'));
      const hasRound = zone.sources.some(s => s.startsWith('round_'));

      const diversity = [hasFib, hasMA, hasRound].filter(Boolean).length;
      score += diversity * 10;

      // Proximity to current price (max 40 points)
      if (zone.distance < 0.01) {
        score += 40; // Very close
      } else if (zone.distance < 0.05) {
        score += 30; // Close
      } else if (zone.distance < 0.1) {
        score += 20; // Moderate
      } else if (zone.distance < 0.25) {
        score += 10; // Far but relevant
      }

      return Math.min(score, 100);
    } catch (err) {
      log.error({ err, zone }, 'Confluence zone scoring failed');
      return 0;
    }
  }

  /**
   * Comprehensive confluence analysis
   * Returns ranked institutional entry zones
   */
  analyzeConfluence(currentPrice, priceHistory, swingHigh, swingLow) {
    try {
      // Detect all signal types
      const fibLevels = this.detectFibonacciLevels(swingHigh, swingLow);
      const maLevels = this.detectMovingAverageLevels(priceHistory);
      const roundNumbers = this.detectRoundNumberLevels(currentPrice);

      // Find confluence zones
      const zones = this.detectConfluenceZones(
        fibLevels,
        maLevels,
        roundNumbers,
        currentPrice
      );

      // Score and rank
      const rankedZones = zones
        .map(zone => ({
          ...zone,
          score: this.scoreConfluenceZone(zone),
          interpretation: this.getInterpretation(zone)
        }))
        .sort((a, b) => b.score - a.score);

      return {
        currentPrice,
        topZone: rankedZones[0] || null,
        allZones: rankedZones,
        riskLevel: this.assessRisk(rankedZones, currentPrice)
      };
    } catch (err) {
      log.error({ err }, 'Confluence analysis failed');
      return {
        currentPrice,
        topZone: null,
        allZones: [],
        riskLevel: 'UNKNOWN'
      };
    }
  }

  getInterpretation(zone) {
    if (zone.strength >= 5) return 'Institutional gridlock - strong support';
    if (zone.strength >= 4) return 'Multiple signal confluence';
    if (zone.strength >= 3) return 'Support zone identified';
    return 'Weak confluence';
  }

  assessRisk(zones, currentPrice) {
    if (!zones || zones.length === 0) return 'HIGH';

    const topZone = zones[0];
    
    if (topZone.score >= 80) return 'LOW';
    if (topZone.score >= 60) return 'MEDIUM';
    if (topZone.score >= 40) return 'MEDIUM_HIGH';
    return 'HIGH';
  }
}

module.exports = new ConfluenceDetector();
