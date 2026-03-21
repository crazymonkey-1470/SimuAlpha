import { Topbar } from "@/components/layout/topbar";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { BiasBadge } from "@/components/ui/badge";
import { ConfidenceBar } from "@/components/ui/confidence-bar";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function SignalsPage() {
  const [signal, history] = await Promise.all([
    api.signals.current(),
    api.signals.history(),
  ]);

  return (
    <>
      <Topbar
        title="Signal Output"
        subtitle="Directional signals and posture guidance"
      />
      <div className="p-6 space-y-6">
        {/* Current signal */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Current Signal</CardTitle>
              <span className="text-2xs text-text-tertiary">
                {new Date(signal.updated_at).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZoneName: "short",
                })}
              </span>
            </CardHeader>

            <div className="mb-5 flex items-center gap-4">
              <BiasBadge bias={signal.bias} />
              <span className="rounded bg-surface-3 px-2 py-0.5 text-xs text-text-secondary">
                {signal.time_horizon}
              </span>
            </div>

            <ConfidenceBar value={signal.confidence} label="Signal confidence" size="md" className="mb-5" />

            <div className="rounded-md bg-surface-2 px-4 py-3 mb-5">
              <p className="text-2xs font-medium uppercase tracking-wider text-text-tertiary mb-1">
                Suggested Posture
              </p>
              <p className="text-sm text-text-primary leading-relaxed">
                {signal.suggested_posture}
              </p>
            </div>

            <div>
              <p className="text-2xs font-medium uppercase tracking-wider text-text-tertiary mb-2">
                Change vs Prior
              </p>
              <p className="text-xs text-text-secondary leading-relaxed">
                {signal.change_vs_prior}
              </p>
            </div>
          </Card>

          <Card>
            <CardTitle className="mb-3">Active Warnings</CardTitle>
            <div className="space-y-2">
              {signal.warnings.map((w, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-md border border-accent-amber/20 bg-accent-amber/5 px-3 py-2.5"
                >
                  <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-amber" />
                  <span className="text-xs text-text-secondary leading-relaxed">
                    {w}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Signal history */}
        <Card>
          <CardHeader>
            <CardTitle>Signal History</CardTitle>
            <span className="text-2xs text-text-tertiary">
              {history.period_start} — {history.period_end}
            </span>
          </CardHeader>

          <div className="-mx-5 -mb-5">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-t border-border-subtle bg-surface-2 text-text-tertiary">
                  <th className="py-2.5 pl-5 pr-3 text-left font-medium">Date</th>
                  <th className="px-3 py-2.5 text-left font-medium">Bias</th>
                  <th className="px-3 py-2.5 text-left font-medium">Confidence</th>
                  <th className="px-3 py-2.5 text-left font-medium">Posture</th>
                  <th className="py-2.5 pl-3 pr-5 text-left font-medium">Summary</th>
                </tr>
              </thead>
              <tbody>
                {history.entries.map((entry) => (
                  <tr
                    key={entry.date}
                    className="border-t border-border-subtle hover:bg-surface-2/50 transition-colors"
                  >
                    <td className="py-3 pl-5 pr-3 font-mono text-text-tertiary">
                      {entry.date}
                    </td>
                    <td className="px-3 py-3">
                      <BiasBadge bias={entry.bias} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-16 overflow-hidden rounded-full bg-surface-3">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              entry.confidence >= 0.7
                                ? "bg-accent-green"
                                : entry.confidence >= 0.4
                                  ? "bg-accent-amber"
                                  : "bg-accent-red"
                            )}
                            style={{ width: `${entry.confidence * 100}%` }}
                          />
                        </div>
                        <span className="font-mono text-text-secondary">
                          {(entry.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-text-secondary max-w-[180px]">
                      {entry.suggested_posture}
                    </td>
                    <td className="py-3 pl-3 pr-5 text-text-tertiary max-w-[280px]">
                      {entry.summary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
