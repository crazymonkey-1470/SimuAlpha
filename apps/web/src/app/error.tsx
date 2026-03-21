"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent-red/10">
        <svg
          className="h-6 w-6 text-accent-red"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="6.5" />
          <line x1="8" y1="5" x2="8" y2="8.5" />
          <circle cx="8" cy="11" r="0.5" fill="currentColor" />
        </svg>
      </div>
      <h2 className="text-sm font-semibold text-text-primary mb-1">
        Something went wrong
      </h2>
      <p className="text-xs text-text-tertiary max-w-sm mb-4">
        {error.message || "An unexpected error occurred while loading this page."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border border-border-default bg-surface-2 px-4 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-surface-3"
      >
        Try again
      </button>
    </div>
  );
}
