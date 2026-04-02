const config = {
  'LOAD THE BOAT': {
    bg: 'bg-green/15',
    border: 'border-green/40',
    text: 'text-green',
    dot: 'bg-green',
    pulse: true,
  },
  ACCUMULATE: {
    bg: 'bg-amber/15',
    border: 'border-amber/40',
    text: 'text-amber',
    dot: 'bg-amber',
    pulse: false,
  },
  WATCH: {
    bg: 'bg-transparent',
    border: 'border-text-secondary/30',
    text: 'text-text-secondary',
    dot: 'bg-text-secondary',
    pulse: false,
  },
};

export default function SignalBadge({ signal }) {
  const c = config[signal] || config.WATCH;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono font-medium border ${c.bg} ${c.border} ${c.text} ${c.pulse ? 'animate-pulse-slow' : ''}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {signal}
    </span>
  );
}
