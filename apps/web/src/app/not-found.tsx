import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center p-6 text-center">
      <div className="mb-4">
        <span className="font-mono text-5xl font-bold text-surface-4">404</span>
      </div>
      <h2 className="text-sm font-semibold text-text-primary mb-1">
        Page not found
      </h2>
      <p className="text-xs text-text-tertiary max-w-sm mb-6">
        The requested page does not exist or has been moved.
      </p>
      <Link
        href="/"
        className="rounded-md bg-accent-blue/15 px-4 py-2 text-xs font-medium text-accent-blue transition-colors hover:bg-accent-blue/25"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
