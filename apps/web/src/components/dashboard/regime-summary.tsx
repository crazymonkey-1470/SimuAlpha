import type { RegimeSnapshot } from "@/lib/types";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBar } from "@/components/ui/confidence-bar";
import { PressureBar } from "@/components/ui/pressure-bar";
import Link from "next/link";

export function RegimeSummary({ data }: { data: RegimeSnapshot }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Current Regime</CardTitle>
        <Link
          href="/regime"
          className="text-2xs text-text-tertiary hover:text-accent-blue transition-colors"
        >
          Details →
        </Link>
      </CardHeader>

      <div className="mb-4 flex items-baseline gap-3">
        <Badge variant="regime" className="text-sm font-semibold px-3 py-1">
          {data.regime}
        </Badge>
      </div>

      <div className="mb-4 space-y-3">
        <ConfidenceBar value={data.confidence} label="Confidence" size="md" />
        <PressureBar value={data.net_pressure} />
      </div>

      <div className="mb-4 rounded-md bg-surface-2 px-3 py-2.5">
        <p className="text-2xs font-medium uppercase tracking-wider text-text-tertiary mb-1">
          Posture
        </p>
        <p className="text-xs text-text-primary leading-relaxed">
          {data.posture}
        </p>
      </div>

      {data.risk_flags.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-2xs font-medium uppercase tracking-wider text-text-tertiary">
            Risk Flags
          </p>
          {data.risk_flags.map((flag, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-xs text-accent-amber"
            >
              <span className="mt-0.5 h-1 w-1 flex-shrink-0 rounded-full bg-accent-amber" />
              <span className="text-text-secondary">{flag}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
