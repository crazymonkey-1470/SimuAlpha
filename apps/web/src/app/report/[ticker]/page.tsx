"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { DistressReport } from "@/lib/types";

function ratingColor(rating: string): string {
  switch (rating) {
    case "Low": return "text-accent-green bg-accent-green/10 border-accent-green/20";
    case "Moderate": return "text-accent-amber bg-accent-amber/10 border-accent-amber/20";
    case "High": return "text-orange-400 bg-orange-400/10 border-orange-400/20";
    case "Severe": return "text-accent-red bg-accent-red/10 border-accent-red/20";
    default: return "text-text-secondary bg-surface-2 border-border-subtle";
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-1 p-5">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
        {title}
      </h3>
      {children}
    </div>
  );
}

function BulletList({ items, color }: { items: string[]; color?: string }) {
  if (!items.length) return <p className="text-xs text-text-tertiary italic">None identified</p>;
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm leading-relaxed text-text-secondary">
          <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${color ?? "bg-text-tertiary"}`} />
          {item}
        </li>
      ))}
    </ul>
  );
}

function NarrativeBlock({ text }: { text: string | null }) {
  if (!text) return <p className="text-xs text-text-tertiary italic">Data not available</p>;
  return <p className="text-sm leading-relaxed text-text-secondary">{text}</p>;
}

export default function ReportPage() {
  const params = useParams();
  const ticker = (params.ticker as string)?.toUpperCase() ?? "";
  const [report, setReport] = useState<DistressReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    api.analyze(ticker).then((res) => {
      if (res.status === "completed" && res.report) {
        setReport(res.report);
      } else {
        setError(res.message ?? `No data available for ${ticker}.`);
      }
      setLoading(false);
    });
  }, [ticker]);

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="flex items-center justify-between border-b border-border-subtle px-6 py-4 sm:px-10">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-blue/15">
            <span className="text-xs font-bold text-accent-blue">SA</span>
          </div>
          <span className="text-sm font-semibold tracking-tight">SimuAlpha</span>
        </Link>
        <nav className="flex items-center gap-6 text-xs text-text-tertiary">
          <Link href="/methodology" className="hover:text-text-secondary transition-colors">Methodology</Link>
          <Link href="/about" className="hover:text-text-secondary transition-colors">About</Link>
        </nav>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
        {loading && (
          <div className="flex flex-col items-center justify-center py-32 text-sm text-text-tertiary">
            <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-border-default border-t-accent-blue" />
            Analyzing {ticker}...
          </div>
        )}

        {error && !loading && (
          <div className="text-center py-32">
            <p className="text-sm text-text-secondary mb-4">{error}</p>
            <Link href="/" className="text-xs text-accent-blue hover:underline">
              Try another ticker
            </Link>
          </div>
        )}

        {report && !loading && (
          <div className="space-y-6">
            {/* Header */}
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl font-semibold">{report.company_name}</h1>
                <span className="font-mono text-sm text-text-tertiary">{report.ticker}</span>
              </div>
              {(report.sector || report.industry) && (
                <p className="text-xs text-text-tertiary">
                  {[report.sector, report.industry].filter(Boolean).join(" / ")}
                </p>
              )}
            </div>

            {/* Rating badge */}
            <div className="flex items-center gap-4">
              <span className={`inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-semibold ${ratingColor(report.distress_rating)}`}>
                {report.distress_rating} Risk
              </span>
              <span className="font-mono text-xs text-text-tertiary">
                Score: {report.distress_score.toFixed(0)} / 100
              </span>
              {report.source_period_end && (
                <span className="text-2xs text-text-tertiary">
                  Data as of {report.source_period_end}
                </span>
              )}
            </div>

            {/* Executive Summary */}
            <Section title="Executive Summary">
              <p className="text-sm leading-relaxed text-text-primary">
                {report.executive_summary}
              </p>
            </Section>

            {/* Why it may be okay / Key Risks — side by side on larger screens */}
            <div className="grid gap-6 md:grid-cols-2">
              <Section title="Why It May Be Okay">
                <BulletList items={report.why_safe} color="bg-accent-green" />
              </Section>
              <Section title="Key Risk Factors">
                <BulletList items={report.key_risks} color="bg-accent-red" />
              </Section>
            </div>

            {/* Stabilizing factors */}
            <Section title="Stabilizing Factors">
              <BulletList items={report.stabilizing_factors} color="bg-accent-blue" />
            </Section>

            {/* Analysis sections */}
            <Section title="Liquidity Analysis">
              <NarrativeBlock text={report.liquidity_analysis} />
            </Section>

            <Section title="Leverage & Debt Analysis">
              <NarrativeBlock text={report.leverage_analysis} />
            </Section>

            <Section title="Profitability Analysis">
              <NarrativeBlock text={report.profitability_analysis} />
            </Section>

            <Section title="Cash Flow Analysis">
              <NarrativeBlock text={report.cashflow_analysis} />
            </Section>

            <Section title="Interest Coverage">
              <NarrativeBlock text={report.interest_coverage_analysis} />
            </Section>

            <Section title="Dilution & External Financing Risk">
              <NarrativeBlock text={report.dilution_risk_analysis} />
            </Section>

            <Section title="Long-Term Trend & Refinancing">
              <NarrativeBlock text={report.long_term_trend_analysis} />
            </Section>

            {/* If you hold the stock */}
            {report.hold_context && (
              <div className="rounded-lg border border-accent-blue/20 bg-accent-blue/[0.03] p-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent-blue">
                  If You Hold This Stock
                </h3>
                <p className="text-sm leading-relaxed text-text-secondary">
                  {report.hold_context}
                </p>
              </div>
            )}

            {/* What to watch */}
            <Section title="What to Watch Next">
              <BulletList items={report.what_to_watch} color="bg-accent-amber" />
            </Section>

            {/* Analyst notes */}
            {report.analyst_notes && (
              <div className="rounded-lg border border-border-subtle bg-surface-1/50 p-5">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Analyst Notes & Disclaimers
                </h3>
                <p className="text-xs leading-relaxed text-text-tertiary">
                  {report.analyst_notes}
                </p>
              </div>
            )}

            {/* Footer */}
            <div className="border-t border-border-subtle pt-6 flex items-center justify-between text-xs text-text-tertiary">
              <span>
                Report generated {new Date(report.generated_at).toLocaleDateString("en-US", {
                  year: "numeric", month: "long", day: "numeric",
                })}
              </span>
              <Link href="/" className="text-accent-blue hover:underline">
                Analyze another company
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
