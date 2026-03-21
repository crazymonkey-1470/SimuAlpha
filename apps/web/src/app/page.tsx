import { Topbar } from "@/components/layout/topbar";
import { RegimeSummary } from "@/components/dashboard/regime-summary";
import { ActorSummary } from "@/components/dashboard/actor-summary";
import { ScenarioSummary } from "@/components/dashboard/scenario-summary";
import { SignalSummaryCard } from "@/components/dashboard/signal-summary";
import { CrossAssetTable } from "@/components/dashboard/cross-asset-table";
import { Card, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [regime, actorRes, scenarioRes, signal, context] = await Promise.all([
    api.regime.current(),
    api.actors.current(),
    api.scenarios.current(),
    api.signals.current(),
    api.context.crossAsset(),
  ]);

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
      </div>
    </>
  );
}
