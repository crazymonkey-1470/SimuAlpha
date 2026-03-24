"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function HomePage() {
  const [ticker, setTicker] = useState("");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = ticker.trim().toUpperCase();
    if (clean) {
      router.push(`/report/${clean}`);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-4 sm:px-10">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-blue/15">
            <span className="text-xs font-bold text-accent-blue">SA</span>
          </div>
          <span className="text-sm font-semibold tracking-tight">SimuAlpha</span>
        </div>
        <nav className="flex items-center gap-6 text-xs text-text-tertiary">
          <Link href="/methodology" className="hover:text-text-secondary transition-colors">
            Methodology
          </Link>
          <Link href="/about" className="hover:text-text-secondary transition-colors">
            About
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-32">
        <div className="w-full max-w-xl text-center">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Analyze the financial strength of any public company.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary max-w-md mx-auto">
            SimuAlpha reviews debt, liquidity, cash flow, and long-term fundamentals
            to identify financial distress risk.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 flex gap-3">
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="Enter a ticker — e.g. AAPL, F, AMC"
              className="flex-1 rounded-lg border border-border-default bg-surface-1 px-4 py-3 text-sm font-mono text-text-primary placeholder:text-text-tertiary focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/30"
              autoFocus
              spellCheck={false}
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!ticker.trim()}
              className="rounded-lg bg-accent-blue px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-blue/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Analyze
            </button>
          </form>

          <p className="mt-4 text-2xs text-text-tertiary">
            Enter any publicly traded US ticker to generate a structured risk report.
          </p>
        </div>
      </main>
    </div>
  );
}
