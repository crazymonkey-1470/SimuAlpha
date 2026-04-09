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
    },
    'GENERATIONAL_BUY': {
      color: '#00bfff',
      bg: 'rgba(0,191,255,0.12)',
      label: '\uD83D\uDC8E GENERATIONAL BUY',
      pulse: true,
      bold: true
    },
    'LEADING_DIAGONAL_WAVE1': {
      color: '#9b59b6',
      bg: 'rgba(155,89,182,0.1)',
      label: '\uD83D\uDCD0 LEADING DIAGONAL',
      pulse: false
    },
    'ENDING_DIAGONAL_WARNING': {
      color: 'var(--red)',
      bg: 'var(--red-dim, rgba(239,68,68,0.1))',
      label: '\u26A0\uFE0F ENDING DIAGONAL',
      pulse: false
    },
    'WAVE_C_ENDING_DIAGONAL': {
      color: 'var(--signal-green)',
      bg: 'var(--signal-green-dim)',
      label: '\uD83C\uDFAF WAVE C COMPLETING',
      pulse: true
    },
    'STILL_IN_CORRECTION': {
      color: 'var(--signal-amber)',
      bg: 'var(--signal-amber-dim)',
      label: '\u23F3 CORRECTION IN PROGRESS',
      pulse: false
    },
    'WAVE_3_TARGET_HIT': {
      color: 'var(--signal-amber)',
      bg: 'var(--signal-amber-dim)',
      label: '\u2702\uFE0F TRIM 50% \u2014 WAVE 3 HIT',
      pulse: true
    },
    'WAVE_4_ADD_ZONE': {
      color: 'var(--signal-green)',
      bg: 'var(--signal-green-dim)',
      label: '\u2795 WAVE 4 ADD ZONE',
      pulse: true
    },
    'WAVE_5_TARGET_HIT': {
      color: 'var(--signal-amber)',
      bg: 'var(--signal-amber-dim)',
      label: '\uD83D\uDCB0 TAKE PROFITS \u2014 WAVE 5',
      pulse: true
    },
    'WAVE_B_REJECTION': {
      color: 'var(--red)',
      bg: 'var(--red-dim, rgba(239,68,68,0.1))',
      label: '\uD83D\uDEA8 WAVE B \u2014 EXIT LIQUIDITY',
      pulse: true
    },
    'FUNDAMENTAL_DETERIORATION': {
      color: 'var(--red)',
      bg: 'var(--red-dim, rgba(239,68,68,0.1))',
      label: '\u26D4 THESIS BROKEN',
      pulse: false,
      bold: true
    },
    'VALUE_TRAP': {
      color: 'var(--red)',
      bg: 'var(--red-dim, rgba(239,68,68,0.1))',
      label: '\uD83D\uDEAB VALUE TRAP',
      pulse: false,
      bold: true
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
        fontWeight: c.bold ? 700 : 500,
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
