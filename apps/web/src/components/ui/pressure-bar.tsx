import { cn } from "@/lib/utils";

interface PressureBarProps {
  value: number; // -1 to 1
  className?: string;
}

export function PressureBar({ value, className }: PressureBarProps) {
  const normalized = ((value + 1) / 2) * 100; // 0-100, 50 is center
  const isPositive = value >= 0;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between">
        <span className="text-2xs text-text-tertiary">Net pressure</span>
        <span
          className={cn(
            "font-mono text-2xs",
            isPositive ? "text-accent-green" : "text-accent-red"
          )}
        >
          {value >= 0 ? "+" : ""}
          {value.toFixed(2)}
        </span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className="absolute left-1/2 top-0 h-full w-px bg-border-strong" />
        {isPositive ? (
          <div
            className="absolute top-0 h-full rounded-r-full bg-accent-green/70"
            style={{ left: "50%", width: `${((normalized - 50) / 50) * 50}%` }}
          />
        ) : (
          <div
            className="absolute top-0 h-full rounded-l-full bg-accent-red/70"
            style={{
              right: "50%",
              width: `${((50 - normalized) / 50) * 50}%`,
            }}
          />
        )}
      </div>
      <div className="flex justify-between text-2xs text-text-tertiary">
        <span>Bearish</span>
        <span>Bullish</span>
      </div>
    </div>
  );
}
