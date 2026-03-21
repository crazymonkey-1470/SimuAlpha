import type { ScenarioBranch } from "@/lib/types";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DirectionBadge, RiskBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Link from "next/link";

export function ScenarioSummary({
  scenarios,
  baseCaseId,
}: {
  scenarios: ScenarioBranch[];
  baseCaseId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Scenario Branches</CardTitle>
        <Link
          href="/scenarios"
          className="text-2xs text-text-tertiary hover:text-accent-blue transition-colors"
        >
          Details →
        </Link>
      </CardHeader>

      <div className="space-y-2">
        {scenarios.map((s) => (
          <div
            key={s.id}
            className={cn(
              "rounded-md border px-3 py-2.5",
              s.id === baseCaseId
                ? "border-accent-blue/30 bg-accent-blue/5"
                : "border-border-subtle bg-surface-2"
            )}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-text-primary">
                  {s.name}
                </p>
                {s.id === baseCaseId && (
                  <span className="text-2xs text-accent-blue font-medium">
                    BASE
                  </span>
                )}
              </div>
              <span className="font-mono text-sm font-semibold text-text-primary">
                {(s.probability * 100).toFixed(0)}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <DirectionBadge direction={s.direction} />
              <RiskBadge level={s.risk_level} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
