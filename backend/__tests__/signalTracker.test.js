// We test the pure utility functions — the async DB functions are integration tests.
// Import the module to access getCurrentScoringWeights and test isActionableSignal logic.
// isActionableSignal is not exported, so we test it through the ACTIONABLE_SIGNALS list behavior.

describe('signalTracker utilities', () => {
  // We can test getCurrentScoringWeights which is a pure function
  const { getCurrentScoringWeights } = require('../services/signalTracker');

  describe('getCurrentScoringWeights', () => {
    it('returns v2 weights structure', () => {
      const weights = getCurrentScoringWeights();
      expect(weights.version).toBe('v2');
      expect(weights.fundamental).toBeDefined();
      expect(weights.technical).toBeDefined();
    });

    it('has correct fundamental weight breakdown summing to 50', () => {
      const { fundamental } = getCurrentScoringWeights();
      const sum = Object.values(fundamental).reduce((a, b) => a + b, 0);
      expect(sum).toBe(50);
    });

    it('has correct technical weight breakdown summing to 50', () => {
      const { technical } = getCurrentScoringWeights();
      const sum = Object.values(technical).reduce((a, b) => a + b, 0);
      expect(sum).toBe(50);
    });
  });
});
