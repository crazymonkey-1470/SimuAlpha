/**
 * BacktestBadge — Compact summary of backtest performance.
 * Shows win rate, avg return, and number of signals.
 */
export default function BacktestBadge({ backtest, compact = false }) {
  if (!backtest || backtest.total_signals == null) {
    return (
      <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)' }}>
        {compact ? '\u2014' : 'No backtest data'}
      </span>
    );
  }

  if (backtest.total_signals < 3) {
    return (
      <span style={{
        fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)',
        fontStyle: 'italic'
      }}>
        INSUFFICIENT HISTORY
      </span>
    );
  }

  const winRate = backtest.win_rate_pct;
  const winColor = winRate > 65 ? 'var(--signal-green)' : winRate >= 50 ? 'var(--signal-amber)' : 'var(--red, #ef4444)';

  if (compact) {
    return (
      <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 500, color: winColor }}>
        {winRate?.toFixed(0)}%
      </span>
    );
  }

  return (
    <div style={{
      display: 'inline-flex', flexDirection: 'column',
      padding: '8px 12px', borderRadius: '6px',
      background: 'var(--bg-secondary)', border: '1px solid var(--border)'
    }}>
      <div style={{
        fontFamily: 'IBM Plex Mono', fontSize: '9px', fontWeight: 500,
        color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: '4px'
      }}>
        BACKTESTED \u00B7 {backtest.total_signals} signals
      </div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'baseline' }}>
        <div>
          <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '16px', fontWeight: 600, color: winColor }}>
            {winRate?.toFixed(0)}%
          </span>
          <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-dim)', marginLeft: '4px' }}>
            win
          </span>
        </div>
        {backtest.avg_return_pct != null && (
          <div>
            <span style={{
              fontFamily: 'IBM Plex Mono', fontSize: '12px', fontWeight: 500,
              color: backtest.avg_return_pct > 0 ? 'var(--signal-green)' : 'var(--red, #ef4444)'
            }}>
              {backtest.avg_return_pct > 0 ? '+' : ''}{backtest.avg_return_pct.toFixed(1)}%
            </span>
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-dim)', marginLeft: '4px' }}>
              avg
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
