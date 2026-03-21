import { cn } from "@/lib/utils";

interface ConfidenceBarProps {
  value: number;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

export function ConfidenceBar({
  value,
  label,
  size = "sm",
  className,
}: ConfidenceBarProps) {
  const pct = Math.round(value * 100);
  const barColor =
    value >= 0.7
      ? "bg-accent-green"
      : value >= 0.4
        ? "bg-accent-amber"
        : "bg-accent-red";

  return (
    <div className={cn("space-y-1", className)}>
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-2xs text-text-tertiary">{label}</span>
          <span className="font-mono text-2xs text-text-secondary">{pct}%</span>
        </div>
      )}
      <div
        className={cn(
          "overflow-hidden rounded-full bg-surface-3",
          size === "sm" ? "h-1" : "h-1.5"
        )}
      >
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
