import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <span className="font-mono text-5xl font-bold text-surface-4">404</span>
      <h2 className="mt-4 text-sm font-semibold">Page not found</h2>
      <p className="mt-1 text-xs text-text-tertiary max-w-sm">
        The requested page does not exist.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-md bg-accent-blue/15 px-4 py-2 text-xs font-medium text-accent-blue hover:bg-accent-blue/25 transition-colors"
      >
        Back to home
      </Link>
    </div>
  );
}
