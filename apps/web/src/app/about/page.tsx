import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-border-subtle px-6 py-4 sm:px-10">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-blue/15">
            <span className="text-xs font-bold text-accent-blue">SA</span>
          </div>
          <span className="text-sm font-semibold tracking-tight">SimuAlpha</span>
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12 sm:px-10">
        <h1 className="text-xl font-semibold mb-6">About SimuAlpha</h1>

        <div className="space-y-6 text-sm text-text-secondary leading-relaxed">
          <p>
            SimuAlpha is a financial distress-risk intelligence platform that analyzes
            publicly traded companies for signs of financial weakness, balance sheet stress,
            and long-term viability concerns.
          </p>
          <p>
            The platform reads public financial statements — including income statements,
            balance sheets, and cash flow reports — and applies a multi-factor scoring
            framework to assess liquidity, leverage, profitability, cash flow health,
            interest coverage, and solvency risk.
          </p>
          <p>
            Each report translates raw financial ratios into plain-English analyst-style
            commentary so that the output is understandable without deep financial expertise.
          </p>

          <h2 className="text-sm font-semibold text-text-primary pt-4">What SimuAlpha is not</h2>
          <ul className="space-y-2 text-xs text-text-tertiary">
            <li>Not a stock screener or trading terminal</li>
            <li>Not a source of personalized investment advice</li>
            <li>Not a prediction engine that guarantees outcomes</li>
            <li>Not a real-time trading signal provider</li>
          </ul>

          <h2 className="text-sm font-semibold text-text-primary pt-4">What SimuAlpha does</h2>
          <ul className="space-y-2 text-xs text-text-tertiary">
            <li>Analyzes public company financial fundamentals for distress risk signals</li>
            <li>Provides structured, explainable risk reports with analyst-style commentary</li>
            <li>Highlights red flags, stabilizing factors, and what to watch next</li>
            <li>Helps users understand the financial health of companies they care about</li>
          </ul>
        </div>

        <div className="mt-10 border-t border-border-subtle pt-6">
          <Link href="/" className="text-xs text-accent-blue hover:underline">
            Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}
