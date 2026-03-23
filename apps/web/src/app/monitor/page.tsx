"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge, BiasBadge, RiskBadge } from "@/components/ui/badge";
import { ConfidenceBar } from "@/components/ui/confidence-bar";
import { MetricBlock } from "@/components/ui/metric-block";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { WatchlistIntelligenceResponse, WatchlistOut } from "@/lib/types";

export default function MonitorPage() {
  return (
    <Suspense fallback={<><Topbar title="Monitor" subtitle="Loading..." /><div className="p-6"><Card><p className="text-xs text-text-tertiary">Loading...</p></Card></div></>}>
      <MonitorPageInner />
    </Suspense>
  );
}

function MonitorPageInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [watchlists, setWatchlists] = useState<WatchlistOut[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("watchlist"));
  const [intel, setIntel] = useState<WatchlistIntelligenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [intelLoading, setIntelLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      api.watchlists.list().then((res) => {
        setWatchlists(res.watchlists);
        if (!selectedId && res.watchlists.length > 0) {
          setSelectedId(res.watchlists[0].id);
        }
        setLoading(false);
      });
    }
  }, [user, selectedId]);

  useEffect(() => {
    if (selectedId) {
      setIntelLoading(true);
      api.watchlists.intelligence(selectedId).then((data) => {
        setIntel(data);
        setIntelLoading(false);
      });
    }
  }, [selectedId]);

  if (authLoading || !user) {
    return (
      <>
        <Topbar title="Monitor" subtitle="Watchlist intelligence board" />
        <div className="p-6 text-sm text-text-tertiary">
          {authLoading ? "Loading..." : "Redirecting to login..."}
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Monitor" subtitle="Watchlist intelligence board" />
      <div className="p-6 space-y-6">
        {/* Watchlist selector */}
        {loading ? (
          <Card><p className="text-xs text-text-tertiary">Loading watchlists...</p></Card>
        ) : watchlists.length === 0 ? (
          <Card>
            <EmptyState title="No watchlists" description="Create a watchlist first to use the monitor." />
          </Card>
        ) : (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              {watchlists.map((wl) => (
                <button
                  key={wl.id}
                  onClick={() => setSelectedId(wl.id)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                    selectedId === wl.id
                      ? "border-accent-blue bg-accent-blue/10 text-accent-blue"
                      : "border-border-default text-text-secondary hover:border-border-strong"
                  )}
                >
                  {wl.name}
                  <span className="ml-1.5 text-text-tertiary">({wl.items.length})</span>
                </button>
              ))}
            </div>

            {intelLoading ? (
              <Card><p className="text-xs text-text-tertiary">Loading intelligence...</p></Card>
            ) : intel ? (
              <IntelligenceBoard intel={intel} />
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

function IntelligenceBoard({ intel }: { intel: WatchlistIntelligenceResponse }) {
  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <MetricBlock label="Symbols" value={intel.symbols.length} />
        </Card>
        <Card>
          <MetricBlock
            label="Total Warnings"
            value={intel.total_warnings}
            valueClass={intel.total_warnings > 0 ? "text-accent-amber" : "text-accent-green"}
          />
        </Card>
        <Card>
          <MetricBlock
            label="High Fragility"
            value={intel.highest_fragility.length}
            valueClass={intel.highest_fragility.length > 0 ? "text-accent-red" : "text-accent-green"}
            sub={intel.highest_fragility.length > 0 ? intel.highest_fragility.join(", ") : "None"}
          />
        </Card>
        <Card>
          <MetricBlock
            label="Top Conviction"
            value={intel.strongest_conviction.length > 0 ? intel.strongest_conviction[0] : "N/A"}
            sub={intel.strongest_conviction.slice(1).join(", ") || undefined}
          />
        </Card>
      </div>

      {/* Distribution cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle className="mb-3">Regime Distribution</CardTitle>
          <div className="space-y-2">
            {Object.entries(intel.regime_distribution).map(([regime, count]) => (
              <div key={regime} className="flex items-center justify-between">
                <Badge variant="regime">{regime}</Badge>
                <span className="font-mono text-xs text-text-secondary">{count}</span>
              </div>
            ))}
            {Object.keys(intel.regime_distribution).length === 0 && (
              <p className="text-2xs text-text-tertiary">No data</p>
            )}
          </div>
        </Card>
        <Card>
          <CardTitle className="mb-3">Signal Distribution</CardTitle>
          <div className="space-y-2">
            {Object.entries(intel.signal_distribution).map(([bias, count]) => (
              <div key={bias} className="flex items-center justify-between">
                <BiasBadge bias={bias} />
                <span className="font-mono text-xs text-text-secondary">{count}</span>
              </div>
            ))}
            {Object.keys(intel.signal_distribution).length === 0 && (
              <p className="text-2xs text-text-tertiary">No data</p>
            )}
          </div>
        </Card>
      </div>

      {/* Symbol intelligence table */}
      <Card>
        <CardTitle className="mb-3">Symbol Intelligence</CardTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-subtle text-left text-text-tertiary">
                <th className="pb-2 pr-4 font-medium">Symbol</th>
                <th className="pb-2 pr-4 font-medium">Regime</th>
                <th className="pb-2 pr-4 font-medium">Confidence</th>
                <th className="pb-2 pr-4 font-medium">Signal</th>
                <th className="pb-2 pr-4 font-medium">Fragility</th>
                <th className="pb-2 pr-4 font-medium">Dominant Actor</th>
                <th className="pb-2 pr-4 font-medium">Base Scenario</th>
                <th className="pb-2 font-medium">Warnings</th>
              </tr>
            </thead>
            <tbody>
              {intel.symbols.map((s) => (
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
                  <td className="py-2.5 pr-4">{s.signal_bias ? <BiasBadge bias={s.signal_bias} /> : "—"}</td>
                  <td className="py-2.5 pr-4"><RiskBadge level={s.fragility} /></td>
                  <td className="py-2.5 pr-4 text-text-secondary">{s.dominant_actor ?? "—"}</td>
                  <td className="py-2.5 pr-4 text-text-secondary">
                    {s.base_scenario ? (
                      <span>{s.base_scenario} <span className="font-mono text-text-tertiary">({s.base_scenario_probability != null ? `${Math.round(s.base_scenario_probability * 100)}%` : ""})</span></span>
                    ) : "—"}
                  </td>
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
    </div>
  );
}
