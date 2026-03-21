import type { CrossAssetResponse } from "@/lib/types";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function CrossAssetTable({ data }: { data: CrossAssetResponse }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Cross-Asset Context</CardTitle>
        <span className="text-2xs text-text-tertiary">
          {new Date(data.as_of).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZoneName: "short",
          })}
        </span>
      </CardHeader>

      <div className="-mx-5 -mb-5">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-t border-border-subtle bg-surface-2 text-text-tertiary">
              <th className="py-2 pl-5 pr-3 text-left font-medium">
                Instrument
              </th>
              <th className="px-3 py-2 text-right font-medium">Price</th>
              <th className="px-3 py-2 text-right font-medium">Chg%</th>
              <th className="px-3 py-2 text-left font-medium">Vol</th>
              <th className="px-3 py-2 text-left font-medium">Trend</th>
              <th className="py-2 pl-3 pr-5 text-left font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((e) => (
              <tr
                key={e.instrument}
                className="border-t border-border-subtle hover:bg-surface-2/50 transition-colors"
              >
                <td className="py-2.5 pl-5 pr-3 font-mono font-medium text-text-primary">
                  {e.instrument}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-text-primary">
                  {e.last_price.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-right font-mono",
                    e.change_pct >= 0 ? "text-accent-green" : "text-accent-red"
                  )}
                >
                  {e.change_pct >= 0 ? "+" : ""}
                  {e.change_pct.toFixed(2)}%
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "inline-flex rounded px-1.5 py-0.5 text-2xs font-medium",
                      e.volatility_state === "compressed" &&
                        "bg-accent-blue/10 text-accent-blue",
                      e.volatility_state === "normal" &&
                        "bg-surface-3 text-text-secondary",
                      e.volatility_state === "elevated" &&
                        "bg-accent-amber/10 text-accent-amber"
                    )}
                  >
                    {e.volatility_state}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "inline-flex rounded px-1.5 py-0.5 text-2xs font-medium",
                      e.trend_state === "uptrend" &&
                        "bg-accent-green/10 text-accent-green",
                      e.trend_state === "downtrend" &&
                        "bg-accent-red/10 text-accent-red",
                      e.trend_state === "range-bound" &&
                        "bg-surface-3 text-text-secondary"
                    )}
                  >
                    {e.trend_state}
                  </span>
                </td>
                <td className="py-2.5 pl-3 pr-5 text-text-tertiary max-w-[200px] truncate">
                  {e.notes}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
