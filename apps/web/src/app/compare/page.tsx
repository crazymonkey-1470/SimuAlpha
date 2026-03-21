"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge, BiasBadge, RiskBadge } from "@/components/ui/badge";
import { ConfidenceBar } from "@/components/ui/confidence-bar";
import { api } from "@/lib/api";
import { cn, biasColor } from "@/lib/utils";
import type { CompareResponse } from "@/lib/types";

export default function ComparePage() {
  return (
    <Suspense fallback={<><Topbar title="Compare" subtitle="Loading..." /><div className="p-6"><Card><p className="text-xs text-text-tertiary">Loading...</p></Card></div></>}>
      <ComparePageInner />
    </Suspense>
  );
}

function ComparePageInner() {
  const searchParams = useSearchParams();
  const initialSymbols = searchParams.get("symbols")?.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) ?? [];
  const [symbols, setSymbols] = useState<string[]>(initialSymbols.length > 0 ? initialSymbols : ["SPY", "QQQ"]);
  const [input, setInput] = useState("");
  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (symbols.length > 0) {
      setLoading(true);
      api.compare(symbols).then((d) => {
        setData(d);
        setLoading(false);
      });
    }
  }, [symbols]);

  function addSymbol() {
    const sym = input.trim().toUpperCase();
    if (sym && !symbols.includes(sym)) {
      setSymbols([...symbols, sym]);
    }
    setInput("");
  }

  function removeSymbol(sym: string) {
    setSymbols(symbols.filter((s) => s !== sym));
  }

  return (
    <>
      <Topbar title="Compare" subtitle="Side-by-side symbol analysis" />
      <div className="p-6 space-y-6">
        {/* Symbol selector */}
        <Card>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {symbols.map((s) => (
              <span
                key={s}
                className="group inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-3 py-1.5 text-xs font-mono font-medium text-text-primary"
              >
                <Link href={`/symbols/${s}`} className="hover:text-accent-blue">{s}</Link>
                <button
                  onClick={() => removeSymbol(s)}
                  className="hidden group-hover:inline text-text-tertiary hover:text-accent-red"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSymbol(); } }}
              placeholder="Add symbol..."
              className="flex-1 max-w-xs rounded-md border border-border-default bg-surface-2 px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:border-accent-blue focus:outline-none"
            />
            <button
              onClick={addSymbol}
              className="rounded-md border border-border-default bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-3"
            >
              Add
            </button>
          </div>
        </Card>

        {/* Comparison table */}
        {loading ? (
          <Card><p className="text-xs text-text-tertiary">Comparing...</p></Card>
        ) : data && data.symbols.length > 0 ? (
          <Card>
            <CardTitle className="mb-3">Comparison</CardTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-text-tertiary">
                    <th className="pb-2 pr-4 font-medium">Symbol</th>
                    <th className="pb-2 pr-4 font-medium">Regime</th>
                    <th className="pb-2 pr-4 font-medium">Confidence</th>
                    <th className="pb-2 pr-4 font-medium">Pressure</th>
                    <th className="pb-2 pr-4 font-medium">Signal</th>
                    <th className="pb-2 pr-4 font-medium">Posture</th>
                    <th className="pb-2 pr-4 font-medium">Fragility</th>
                    <th className="pb-2 pr-4 font-medium">Dominant Actor</th>
                    <th className="pb-2 pr-4 font-medium">Base Scenario</th>
                    <th className="pb-2 font-medium">Warnings</th>
                  </tr>
                </thead>
                <tbody>
                  {data.symbols.map((s) => (
                    <tr key={s.symbol} className="border-b border-border-subtle last:border-0 hover:bg-surface-2 transition-colors">
                      <td className="py-2.5 pr-4">
                        <Link href={`/symbols/${s.symbol}`} className="font-mono font-semibold text-accent-blue hover:underline">
                          {s.symbol}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4">{s.regime ? <Badge variant="regime">{s.regime}</Badge> : "—"}</td>
                      <td className="py-2.5 pr-4">
                        {s.regime_confidence != null ? (
                          <ConfidenceBar value={s.regime_confidence} />
                        ) : "—"}
                      </td>
                      <td className={cn("py-2.5 pr-4 font-mono", s.net_pressure != null ? biasColor(s.net_pressure >= 0 ? "bullish" : "bearish") : "")}>
                        {s.net_pressure != null ? `${s.net_pressure >= 0 ? "+" : ""}${s.net_pressure.toFixed(2)}` : "—"}
                      </td>
                      <td className="py-2.5 pr-4">{s.signal_bias ? <BiasBadge bias={s.signal_bias} /> : "—"}</td>
                      <td className="py-2.5 pr-4 text-text-secondary">{s.posture ?? "—"}</td>
                      <td className="py-2.5 pr-4"><RiskBadge level={s.fragility} /></td>
                      <td className="py-2.5 pr-4 text-text-secondary">{s.dominant_actor ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-text-secondary">{s.base_scenario ?? "—"}</td>
                      <td className="py-2.5">
                        {s.warning_count > 0 ? (
                          <span className="rounded-md bg-accent-amber/10 px-2 py-0.5 text-accent-amber font-mono">{s.warning_count}</span>
                        ) : (
                          <span className="text-text-tertiary">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card><p className="text-xs text-text-tertiary">Select at least one symbol to compare.</p></Card>
        )}
      </div>
    </>
  );
}
