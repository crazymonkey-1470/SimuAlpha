const cfg = {
  'LOAD THE BOAT': { bg: 'bg-green-dim', border: 'border-green/40', text: 'text-green', dot: 'bg-green', pulse: true, emoji: '\u{1F7E2}' },
  ACCUMULATE:      { bg: 'bg-amber-dim', border: 'border-amber/40', text: 'text-amber', dot: 'bg-amber', pulse: false, emoji: '\u{1F7E1}' },
  WATCH:           { bg: 'bg-transparent', border: 'border-text-secondary/30', text: 'text-text-secondary', dot: 'bg-text-secondary', pulse: false, emoji: '\u26AA' },
};

export default function SignalBadge({ signal, compact = false }) {
  const c = cfg[signal] || cfg.WATCH;
  return (
    <span className={`inline-flex items-center gap-1.5 ${compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'} font-mono font-medium border ${c.bg} ${c.border} ${c.text} ${c.pulse ? 'animate-pulse-glow' : ''}`}>
      <span className="text-[10px]">{c.emoji}</span>
      {signal}
    </span>
  );
}
