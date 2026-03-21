"use client";

import { Topbar } from "@/components/layout/topbar";
import { RegimeSummary } from "@/components/dashboard/regime-summary";
import { ActorSummary } from "@/components/dashboard/actor-summary";
import { ScenarioSummary } from "@/components/dashboard/scenario-summary";
import { SignalSummaryCard } from "@/components/dashboard/signal-summary";
import { CrossAssetTable } from "@/components/dashboard/cross-asset-table";
import { Card, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useApiData } from "@/lib/use-api-data";

export default function DashboardPage() {
  const { data, loading } = useApiData(() =>
    Promise.all([
      api.regime.current(),
      api.actors.current(),
      api.scenarios.current(),
      api.signals.current(),
      api.context.crossAsset(),
      api.system.status(),
      api.runs.list(5),
    ])
  );

  if (loading || !data) {
    return (
      <>
        <Topbar title="Dashboard" subtitle="Market intelligence overview" />
        <div className="p-6 text-sm text-text-tertiary">Loading…</div>
      </>
    );
  }

  const [regime, actorRes, scenarioRes, signal, context, systemStatus, runs] = data;

  return (
    <>
      <Topbar
        title="Dashboard"
        subtitle="Market intelligence overview"
      />
      <div className="p-6 space-y-6">
        {/* Narrative summary */}
        <Card className="border-accent-blue/20 bg-accent-blue/[0.03]">
          <CardTitle className="mb-2">Market Summary</CardTitle>
          <p className="text-sm leading-relaxed text-text-secondary">
            {regime.summary}
          </p>
          <div className="mt-3 flex items-center gap-4 text-2xs text-text-tertiary">
            <span>
              Updated{" "}
              {new Date(regime.updated_at).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                timeZoneName: "short",
              })}
            </span>
            <span>·</span>
            <span>Signal horizon: {signal.time_horizon}</span>
            <span>·</span>
            <span>
              {systemStatus.last_simulation_run
                ? `Last run: ${new Date(systemStatus.last_simulation_run).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                : "No runs recorded"}
            </span>
          </div>
        </Card>

        {/* Core panels */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <RegimeSummary data={regime} />
          <SignalSummaryCard data={signal} />
          <ScenarioSummary
            scenarios={scenarioRes.scenarios}
            baseCaseId={scenarioRes.base_case_id}
          />
        </div>

        {/* Actor overview */}
        <ActorSummary actors={actorRes.actors} />

        {/* Cross-asset */}
        <CrossAssetTable data={context} />

        {/* Change vs prior */}
        <Card>
          <CardTitle className="mb-3">Change vs Prior Period</CardTitle>
          <p className="text-sm leading-relaxed text-text-secondary">
            {signal.change_vs_prior}
          </p>
        </Card>

        {/* Recent runs */}
        {runs.runs.length > 0 && (
          <Card>
            <CardTitle className="mb-3">Recent Simulation Runs</CardTitle>
            <div className="space-y-2">
              {runs.runs.map((run) => (
                <div key={run.id} className="flex items-center justify-between text-xs border-b border-border-subtle pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <span className={`inline-block h-2 w-2 rounded-full ${run.status === "completed" ? "bg-accent-green" : run.status === "failed" ? "bg-accent-red" : "bg-accent-amber"}`} />
                    <span className="text-text-secondary">{run.summary || run.status}</span>
                  </div>
                  <span className="font-mono text-text-tertiary">
                    {new Date(run.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
