import { cn } from "@/lib/utils";

interface StatusDotProps {
  status: "healthy" | "warning" | "error" | "idle" | "operational";
  label?: string;
  className?: string;
}

export function StatusDot({ status, label, className }: StatusDotProps) {
  const color =
    status === "healthy" || status === "operational"
      ? "bg-accent-green"
      : status === "warning" || status === "idle"
        ? "bg-accent-amber"
        : "bg-accent-red";

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn("inline-block h-1.5 w-1.5 rounded-full", color)}
      />
      {label && <span className="text-xs text-text-secondary">{label}</span>}
    </span>
  );
}
