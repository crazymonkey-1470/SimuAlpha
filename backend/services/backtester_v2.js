/**
 * backtester_v2.js
 * 
 * Signal accuracy measurement framework
 * Replays historical signals and measures win rate
 * Supports 30/60/90/180/365-day holding periods
 * Returns: win rate, Sharpe ratio, CAGR, drawdown
 */

const log = require('./logger').child({ module: 'backtester_v2' });

class BacktesterV2 {
  /**
   * Test a single signal with historical price data
   * Returns: hit (win/loss), return %, holding period
   */
  async testSignal(signal, historicalPrices, holdDays = 30) {
    try {
      if (!signal || !signal.entry_price || !historicalPrices) {
        return null;
      }

      const entryDate = new Date(signal.timestamp);
      const exitDate = new Date(entryDate.getTime() + holdDays * 24 * 60 * 60 * 1000);

      // Find exit price
      const exitPrice = historicalPrices[exitDate.toISOString().split('T')[0]];

      if (!exitPrice) {
        return null; // Not enough history
      }

      const returnPct = ((exitPrice - signal.entry_price) / signal.entry_price) * 100;
      const win = returnPct > 0;

      return {
        signal_id: signal.id,
        entry_price: signal.entry_price,
        exit_price: exitPrice,
        return_pct: returnPct,
        win,
        hold_days: holdDays,
        tier: signal.tier
      };
    } catch (err) {
      log.error({ err, signal }, 'Signal test failed');
      return null;
    }
  }

  /**
   * Backtest all signals for a ticker over a date range
   */
  async backtest(signals, historicalPrices, holdDays = 30) {
    try {
      const results = [];

      for (const signal of signals) {
        const result = await this.testSignal(signal, historicalPrices, holdDays);
        if (result) {
          results.push(result);
        }
      }

      return this.calculateMetrics(results, holdDays);
    } catch (err) {
      log.error({ err }, 'Backtest failed');
      return null;
    }
  }

  /**
   * Calculate performance metrics
   */
  calculateMetrics(results, holdDays) {
    try {
      if (results.length === 0) {
        return {
          total_signals: 0,
          win_rate: 0,
          avg_return: 0,
          sharpe_ratio: 0,
          max_drawdown: 0,
          cagr: 0
        };
      }

      const wins = results.filter(r => r.win).length;
      const returns = results.map(r => r.return_pct);

      // Win rate
      const winRate = (wins / results.length) * 100;

      // Average return
      const avgReturn = returns.reduce((a, b) => a + b) / results.length;

      // Standard deviation (for Sharpe)
      const variance = returns.reduce(
        (sum, ret) => sum + Math.pow(ret - avgReturn, 2),
        0
      ) / results.length;
      const stdDev = Math.sqrt(variance);

      // Sharpe ratio (assuming 0% risk-free rate)
      const sharpeRatio = stdDev === 0 ? 0 : avgReturn / stdDev;

      // Max drawdown
      let cumReturn = 100;
      let peak = 100;
      let maxDD = 0;

      returns.forEach(ret => {
        cumReturn *= (1 + ret / 100);
        peak = Math.max(peak, cumReturn);
        maxDD = Math.max(maxDD, (peak - cumReturn) / peak);
      });

      // CAGR (annualized return)
      const totalReturn = (cumReturn - 100) / 100;
      const years = (results.length * holdDays) / 365;
      const cagr = Math.pow(1 + totalReturn, 1 / years) - 1;

      return {
        total_signals: results.length,
        win_rate: Math.round(winRate * 100) / 100,
        avg_return: Math.round(avgReturn * 100) / 100,
        sharpe_ratio: Math.round(sharpeRatio * 100) / 100,
        max_drawdown: Math.round(maxDD * 10000) / 100,
        cagr: Math.round(cagr * 10000) / 100,
        hold_days: holdDays
      };
    } catch (err) {
      log.error({ err, results }, 'Metrics calculation failed');
      return null;
    }
  }

  /**
   * Multi-period backtest (30/60/90/180/365 days)
   */
  async multiPeriodBacktest(signals, historicalPrices) {
    try {
      const periods = [30, 60, 90, 180, 365];
      const results = {};

      for (const period of periods) {
        results[`hold_${period}d`] = await this.backtest(
          signals,
          historicalPrices,
          period
        );
      }

      return results;
    } catch (err) {
      log.error({ err }, 'Multi-period backtest failed');
      return null;
    }
  }

  /**
   * Backtest by signal tier (LOAD_THE_BOAT, STRONG_BUY, etc.)
   */
  async backtestByTier(signals, historicalPrices) {
    try {
      const tiers = {};
      const tierGroups = {};

      // Group signals by tier
      signals.forEach(signal => {
        const tier = signal.tier || 'UNKNOWN';
        if (!tierGroups[tier]) {
          tierGroups[tier] = [];
        }
        tierGroups[tier].push(signal);
      });

      // Backtest each tier
      for (const [tier, tierSignals] of Object.entries(tierGroups)) {
        tiers[tier] = await this.backtest(tierSignals, historicalPrices, 30);
      }

      return tiers;
    } catch (err) {
      log.error({ err }, 'Tier backtest failed');
      return null;
    }
  }

  /**
   * Measure improvement over time
   * Rolling 12-week window of signal accuracy
   */
  async measureTrendImprovement(signals, historicalPrices, windowWeeks = 12) {
    try {
      if (signals.length === 0) return null;

      // Sort by date
      const sorted = signals.sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
      );

      const trends = [];
      const windowMs = windowWeeks * 7 * 24 * 60 * 60 * 1000;

      for (let i = 0; i < sorted.length; i++) {
        const current = new Date(sorted[i].timestamp);
        const windowStart = new Date(current.getTime() - windowMs);

        const windowSignals = sorted.filter(s => {
          const d = new Date(s.timestamp);
          return d >= windowStart && d <= current;
        });

        if (windowSignals.length > 5) {
          const metrics = await this.backtest(windowSignals, historicalPrices, 30);
          trends.push({
            date: current.toISOString(),
            window_signals: windowSignals.length,
            win_rate: metrics.win_rate,
            avg_return: metrics.avg_return,
            sharpe_ratio: metrics.sharpe_ratio
          });
        }
      }

      return trends;
    } catch (err) {
      log.error({ err }, 'Trend measurement failed');
      return null;
    }
  }
}

module.exports = new BacktesterV2();
