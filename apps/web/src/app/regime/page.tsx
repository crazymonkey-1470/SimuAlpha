import { Topbar } from "@/components/layout/topbar";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBar } from "@/components/ui/confidence-bar";
import { PressureBar } from "@/components/ui/pressure-bar";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function RegimePage() {
  const [regime, history] = await Promise.all([
    api.regime.current(),
    api.regime.history(),
  ]);

  return (
    <>
      <Topbar title="Regime Analysis" subtitle="Market regime classification and drivers" />
      <div className="p-6 space-y-6">
        {/* Current regime header */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Current Regime</CardTitle>
              <span className="text-2xs text-text-tertiary">
                {new Date(regime.updated_at).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZoneName: "short",
                })}
              </span>
            </CardHeader>

            <div className="mb-5 flex items-baseline gap-4">
              <Badge variant="regime" className="text-lg font-semibold px-4 py-1.5">
                {regime.regime}
              </Badge>
            </div>

            <p className="text-sm leading-relaxed text-text-secondary mb-5">
              {regime.summary}
            </p>

            <div className="grid grid-cols-2 gap-4">
              <ConfidenceBar value={regime.confidence} label="Regime confidence" size="md" />
              <PressureBar value={regime.net_pressure} />
            </div>
          </Card>

          <Card>
            <CardTitle className="mb-4">Posture</CardTitle>
            <div className="rounded-md bg-surface-2 px-4 py-3 mb-5">
              <p className="text-sm font-medium text-text-primary leading-relaxed">
                {regime.posture}
              </p>
            </div>

            <CardTitle className="mb-3">Risk Flags</CardTitle>
            <div className="space-y-2">
              {regime.risk_flags.map((flag, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-md border border-accent-amber/20 bg-accent-amber/5 px-3 py-2"
                >
                  <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-amber" />
                  <span className="text-xs text-text-secondary leading-relaxed">{flag}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Drivers */}
        <Card>
          <CardTitle className="mb-4">Regime Drivers</CardTitle>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {regime.drivers.map((d, i) => (
              <div
                key={i}
                className="rounded-md border border-border-subtle bg-surface-2 p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-text-primary capitalize">
                    {d.factor}
                  </p>
                  <span
                    className={cn(
                      "font-mono text-xs font-semibold",
                      d.influence >= 0
                        ? "text-accent-green"
                        : "text-accent-red"
                    )}
                  >
                    {d.influence >= 0 ? "+" : ""}
                    {(d.influence * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-xs text-text-tertiary leading-relaxed">
                  {d.description}
                </p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      d.influence >= 0 ? "bg-accent-green/60" : "bg-accent-red/60"
                    )}
                    style={{ width: `${Math.abs(d.influence) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* History timeline */}
        <Card>
          <CardHeader>
            <CardTitle>Regime History</CardTitle>
            <span className="text-2xs text-text-tertiary">
              {history.period_start} — {history.period_end}
            </span>
          </CardHeader>

          <div className="space-y-0">
            {history.entries.map((entry, i) => (
              <div
                key={entry.date}
                className={cn(
                  "flex items-start gap-4 py-3",
                  i < history.entries.length - 1 && "border-b border-border-subtle"
                )}
              >
                <div className="flex-shrink-0 pt-0.5">
                  <span className="font-mono text-xs text-text-tertiary">
                    {entry.date}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="regime" className="text-2xs">{entry.regime}</Badge>
                    <span className="font-mono text-2xs text-text-tertiary">
                      conf: {(entry.confidence * 100).toFixed(0)}%
                    </span>
                    <span
                      className={cn(
                        "font-mono text-2xs",
                        entry.net_pressure >= 0
                          ? "text-accent-green"
                          : "text-accent-red"
                      )}
                    >
                      p: {entry.net_pressure >= 0 ? "+" : ""}
                      {entry.net_pressure.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary">{entry.summary}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
