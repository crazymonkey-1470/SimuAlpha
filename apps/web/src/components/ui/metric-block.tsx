import { cn } from "@/lib/utils";

interface MetricBlockProps {
  label: string;
  value: string | number;
  sub?: string;
  valueClass?: string;
  className?: string;
}

export function MetricBlock({
  label,
  value,
  sub,
  valueClass,
  className,
}: MetricBlockProps) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-2xs font-medium uppercase tracking-wider text-text-tertiary">
        {label}
      </p>
      <p className={cn("text-lg font-semibold text-text-primary", valueClass)}>
        {value}
      </p>
      {sub && <p className="text-2xs text-text-tertiary">{sub}</p>}
    </div>
  );
}
