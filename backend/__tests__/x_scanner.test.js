/**
 * Regex fallback for SAIN X signal extraction.
 *
 * Guards the fallback path that keeps sain_signals populated when the
 * Claude extractor is unavailable (no ANTHROPIC_API_KEY, rate limit,
 * malformed response). Without a fallback, every tweet silently returned
 * null and sain_signals stayed empty.
 */

const { regexExtractSignal } = require('../services/x_scanner');

describe('regexExtractSignal', () => {
  it('extracts a BUY signal from a cashtag + bullish keyword', () => {
    const r = regexExtractSignal("I'm buying $AAPL here, strong setup");
    expect(r).not.toBeNull();
    expect(r.ticker).toBe('AAPL');
    expect(r.direction).toBe('BUY');
    expect(r._extractor).toBe('regex');
  });

  it('extracts a SELL signal from a cashtag + bearish keyword', () => {
    const r = regexExtractSignal('Selling $TSLA, bad quarter coming');
    expect(r).not.toBeNull();
    expect(r.ticker).toBe('TSLA');
    expect(r.direction).toBe('SELL');
  });

  it('returns null for generic commentary with no cashtag', () => {
    expect(regexExtractSignal('I like tech stocks right now')).toBeNull();
  });

  it('returns null for cashtag without a direction word', () => {
    expect(regexExtractSignal('$NVDA just reported earnings')).toBeNull();
  });

  it('returns null when both BUY and SELL keywords appear (ambiguous)', () => {
    expect(regexExtractSignal('Buying $AAPL, selling $GOOG')).toBeNull();
  });

  it('returns null when multiple cashtags appear (can mis-attribute direction)', () => {
    expect(regexExtractSignal('Bullish on $AAPL and $MSFT right now')).toBeNull();
  });

  it('ignores currency codes like $USD', () => {
    expect(regexExtractSignal('Buying $USD against yen')).toBeNull();
  });

  it('ignores dollar amounts like $50', () => {
    expect(regexExtractSignal('Buying at $50 level')).toBeNull();
  });

  it('handles tweet with multi-word thesis', () => {
    const r = regexExtractSignal("I'm bullish on $HIMS here, Wave 3 setup forming");
    expect(r).not.toBeNull();
    expect(r.ticker).toBe('HIMS');
    expect(r.direction).toBe('BUY');
  });

  it('returns null for empty string', () => {
    expect(regexExtractSignal('')).toBeNull();
    expect(regexExtractSignal(null)).toBeNull();
  });
});
