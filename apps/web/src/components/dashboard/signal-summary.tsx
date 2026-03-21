import type { SignalSummary as SignalSummaryType } from "@/lib/types";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { BiasBadge } from "@/components/ui/badge";
import { ConfidenceBar } from "@/components/ui/confidence-bar";
import Link from "next/link";

export function SignalSummaryCard({ data }: { data: SignalSummaryType }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Current Signal</CardTitle>
        <Link
          href="/signals"
          className="text-2xs text-text-tertiary hover:text-accent-blue transition-colors"
        >
          History →
        </Link>
      </CardHeader>

      <div className="mb-4 flex items-center gap-3">
        <BiasBadge bias={data.bias} />
        <span className="text-2xs text-text-tertiary">
          {data.time_horizon}
        </span>
      </div>

      <ConfidenceBar value={data.confidence} label="Signal confidence" className="mb-4" />

      <div className="mb-4 rounded-md bg-surface-2 px-3 py-2.5">
        <p className="text-2xs font-medium uppercase tracking-wider text-text-tertiary mb-1">
          Suggested Posture
        </p>
        <p className="text-xs text-text-primary leading-relaxed">
          {data.suggested_posture}
        </p>
      </div>

      {data.warnings.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-2xs font-medium uppercase tracking-wider text-text-tertiary">
            Warnings
          </p>
          {data.warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-xs"
            >
              <span className="mt-0.5 h-1 w-1 flex-shrink-0 rounded-full bg-accent-amber" />
              <span className="text-text-secondary">{w}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
