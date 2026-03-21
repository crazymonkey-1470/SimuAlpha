import { cn, riskBg } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "outline" | "regime" | "risk";
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        variant === "default" && "bg-surface-3 text-text-secondary",
        variant === "outline" && "border border-border-default text-text-secondary",
        variant === "regime" && "bg-accent-blue/10 text-accent-blue",
        variant === "risk" && "bg-accent-amber/10 text-accent-amber",
        className
      )}
    >
      {children}
    </span>
  );
}

export function BiasBadge({ bias }: { bias: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        bias.toLowerCase().includes("bullish") && "bg-accent-green/10 text-accent-green",
        bias.toLowerCase().includes("bearish") && "bg-accent-red/10 text-accent-red",
        !bias.toLowerCase().includes("bullish") &&
          !bias.toLowerCase().includes("bearish") &&
          "bg-surface-3 text-text-secondary"
      )}
    >
      {bias}
    </span>
  );
}

export function RiskBadge({ level }: { level: string }) {
  return <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", riskBg(level))}>{level}</span>;
}

export function DirectionBadge({ direction }: { direction: string }) {
  const d = direction.toLowerCase();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        d.includes("bullish") && "bg-accent-green/10 text-accent-green",
        d.includes("bearish") && "bg-accent-red/10 text-accent-red",
        !d.includes("bullish") && !d.includes("bearish") && "bg-surface-3 text-text-secondary"
      )}
    >
      {direction}
    </span>
  );
}
