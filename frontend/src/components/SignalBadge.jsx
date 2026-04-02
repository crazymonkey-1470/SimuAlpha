const signalConfig = {
  'LOAD THE BOAT': {
    color: '#00ff88',
    bg: 'bg-accent/10',
    border: 'border-accent/40',
    pulse: true,
  },
  'ACCUMULATE': {
    color: '#f5a623',
    bg: 'bg-amber/10',
    border: 'border-amber/40',
    pulse: false,
  },
  'WATCH': {
    color: '#8a8a9a',
    bg: 'bg-text-secondary/10',
    border: 'border-text-secondary/30',
    pulse: false,
  },
};

export default function SignalBadge({ signal }) {
  const config = signalConfig[signal] || signalConfig.WATCH;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium border ${config.bg} ${config.border} ${config.pulse ? 'animate-pulse' : ''}`}
      style={{ color: config.color }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: config.color }}
      />
      {signal}
    </span>
  );
}
