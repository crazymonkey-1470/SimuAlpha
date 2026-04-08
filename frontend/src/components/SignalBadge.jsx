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
    },
    'WAVE_C_BOTTOM': {
      color: 'var(--signal-green)',
      bg: 'var(--signal-green-dim)',
      label: '\u25CF WAVE C \u2014 BUY',
      pulse: true
    },
    'WAVE_2_BOTTOM': {
      color: 'var(--signal-green)',
      bg: 'var(--signal-green-dim)',
      label: '\u25CF WAVE 2 \u2014 BUY',
      pulse: true
    },
    'WAVE_4_BOTTOM': {
      color: 'var(--signal-amber)',
      bg: 'var(--signal-amber-dim)',
      label: '\u25D0 WAVE 4 \u2014 ADD',
      pulse: false
    },
    'WAVE_3_IN_PROGRESS': {
      color: 'var(--red)',
      bg: 'var(--red-dim, rgba(239,68,68,0.1))',
      label: '\u25CF WAVE 3 \u2014 WAIT',
      pulse: false
    },
    'WAVE_5_IN_PROGRESS': {
      color: 'var(--red)',
      bg: 'var(--red-dim, rgba(239,68,68,0.1))',
      label: '\u25CF WAVE 5 \u2014 SELL',
      pulse: false
    },
    'WAVE_B_BOUNCE': {
      color: 'var(--red)',
      bg: 'var(--red-dim, rgba(239,68,68,0.1))',
      label: '\u25CF WAVE B \u2014 AVOID',
      pulse: false
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
