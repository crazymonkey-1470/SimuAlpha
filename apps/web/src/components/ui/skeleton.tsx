import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-surface-3",
        className
      )}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-1 p-5 space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}
