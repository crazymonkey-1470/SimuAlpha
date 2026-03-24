import Link from "next/link";

const FACTORS = [
  { name: "Liquidity", weight: "~20%", desc: "Current ratio, cash-to-debt ratio, and working capital position measure the company's ability to meet near-term obligations." },
  { name: "Leverage", weight: "~20%", desc: "Debt-to-equity, debt-to-assets, and debt-to-EBITDA ratios assess the overall debt burden and balance sheet risk." },
  { name: "Profitability", weight: "~15%", desc: "Operating margin, net margin, and trend direction evaluate whether the core business generates sustainable earnings." },
  { name: "Cash Flow", weight: "~20%", desc: "Operating cash flow and free cash flow, including trend direction, determine whether the business generates or consumes cash." },
  { name: "Interest Coverage", weight: "~15%", desc: "EBITDA relative to interest expense measures the ability to service existing debt — one of the most direct near-term default indicators." },
  { name: "Altman Z-Score", weight: "~10%", desc: "A well-established academic model combining working capital, retained earnings, EBIT, market capitalization, and revenue relative to total assets." },
];

export default function MethodologyPage() {
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
        <h1 className="text-xl font-semibold mb-2">Methodology</h1>
        <p className="text-sm text-text-secondary leading-relaxed mb-8">
          SimuAlpha uses a multi-factor composite scoring model to estimate financial
          distress risk for publicly traded companies. The model combines several
          fundamental dimensions rather than relying on any single ratio.
        </p>

        <h2 className="text-sm font-semibold mb-4">Scoring Factors</h2>
        <div className="space-y-4 mb-10">
          {FACTORS.map((f) => (
            <div key={f.name} className="rounded-lg border border-border-subtle bg-surface-1 p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-text-primary">{f.name}</span>
                <span className="font-mono text-xs text-text-tertiary">{f.weight}</span>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        <h2 className="text-sm font-semibold mb-3">Rating Scale</h2>
        <div className="grid grid-cols-2 gap-3 mb-10 sm:grid-cols-4">
          {[
            { label: "Low", range: "0–25", color: "text-accent-green border-accent-green/20" },
            { label: "Moderate", range: "26–50", color: "text-accent-amber border-accent-amber/20" },
            { label: "High", range: "51–75", color: "text-orange-400 border-orange-400/20" },
            { label: "Severe", range: "76–100", color: "text-accent-red border-accent-red/20" },
          ].map((r) => (
            <div key={r.label} className={`rounded-lg border bg-surface-1 p-3 text-center ${r.color}`}>
              <p className="text-sm font-semibold">{r.label}</p>
              <p className="font-mono text-xs opacity-70">{r.range}</p>
            </div>
          ))}
        </div>

        <h2 className="text-sm font-semibold mb-3">Important Disclaimers</h2>
        <ul className="space-y-2 text-xs text-text-tertiary leading-relaxed">
          <li>SimuAlpha analysis is informational only and does not constitute investment advice.</li>
          <li>The model estimates distress probability based on publicly available financial data and should not be interpreted as a guarantee of future outcomes.</li>
          <li>Past financial performance does not predict future results.</li>
          <li>Always consult qualified financial professionals before making investment decisions.</li>
          <li>Data accuracy depends on the quality and timeliness of source financial statements.</li>
        </ul>

        <div className="mt-10 border-t border-border-subtle pt-6">
          <Link href="/" className="text-xs text-accent-blue hover:underline">
            Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}
