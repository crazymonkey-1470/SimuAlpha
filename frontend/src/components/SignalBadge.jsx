export default function SignalBadge({ signal, size = 'md' }) {
  const config = {
    'LOAD THE BOAT': {
      color: 'var(--signal-green)',
      bg: 'var(--signal-green-dim)',
      label: '\u25CF LOAD THE BOAT',
      pulse: true
    },
    'ACCUMULATE': {
      color: 'var(--signal-amber)',
      bg: 'var(--signal-amber-dim)',
      label: '\u25D0 ACCUMULATE',
      pulse: false
    },
    'WATCH': {
      color: 'var(--text-secondary)',
      bg: 'transparent',
      label: '\u25CB WATCH',
      pulse: false,
      border: '1px solid var(--border-light)'
    }
  };

  const c = config[signal] || config['WATCH'];
  const fontSize = size === 'sm' ? '10px' : size === 'lg' ? '14px' : '11px';
  const padding = size === 'sm' ? '3px 8px' : size === 'lg' ? '8px 16px' : '4px 10px';

  return (
    <span
      className={c.pulse ? 'pulse-green' : ''}
      style={{
        display: 'inline-block',
        fontFamily: 'IBM Plex Mono',
        fontSize,
        fontWeight: 500,
        color: c.color,
        background: c.bg,
        border: c.border || `1px solid ${c.color}30`,
        borderRadius: '4px',
        padding,
        letterSpacing: '0.05em',
        whiteSpace: 'nowrap'
      }}
    >
      {c.label}
    </span>
  );
}
