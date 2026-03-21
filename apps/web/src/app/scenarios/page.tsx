import { Topbar } from "@/components/layout/topbar";
import { Card, CardTitle } from "@/components/ui/card";
import { DirectionBadge, RiskBadge } from "@/components/ui/badge";
import { cn, formatArchetype } from "@/lib/utils";
import { api } from "@/lib/api";
import type { ScenarioBranch } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ScenariosPage() {
  const data = await api.scenarios.current();

  return (
    <>
      <Topbar
        title="Scenario Analysis"
        subtitle="Probabilistic scenario branches and actor reactions"
      />
      <div className="p-6 space-y-6">
        {/* Probability distribution */}
        <Card>
          <CardTitle className="mb-4">Probability Distribution</CardTitle>
          <div className="flex items-center gap-1 h-10 rounded-md overflow-hidden">
            {data.scenarios.map((s) => {
              const colors: Record<string, string> = {
                "scenario-base": "bg-accent-blue",
                "scenario-vol-expansion": "bg-accent-amber",
                "scenario-breakout": "bg-accent-green",
                "scenario-macro-shock": "bg-accent-red",
              };
              return (
                <div
                  key={s.id}
                  className={cn(
                    "h-full flex items-center justify-center text-xs font-semibold text-surface-0 rounded-sm",
                    colors[s.id] ?? "bg-surface-4"
                  )}
                  style={{ width: `${s.probability * 100}%` }}
                >
                  {(s.probability * 100).toFixed(0)}%
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-4">
            {data.scenarios.map((s) => {
              const dotColors: Record<string, string> = {
                "scenario-base": "bg-accent-blue",
                "scenario-vol-expansion": "bg-accent-amber",
                "scenario-breakout": "bg-accent-green",
                "scenario-macro-shock": "bg-accent-red",
              };
              return (
                <div key={s.id} className="flex items-center gap-1.5 text-2xs text-text-tertiary">
                  <span className={cn("inline-block h-2 w-2 rounded-sm", dotColors[s.id] ?? "bg-surface-4")} />
                  {s.name}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Scenario cards */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {data.scenarios.map((s) => (
            <ScenarioCard
              key={s.id}
              scenario={s}
              isBase={s.id === data.base_case_id}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function ScenarioCard({
  scenario,
  isBase,
}: {
  scenario: ScenarioBranch;
  isBase: boolean;
}) {
  return (
    <Card
      className={cn(
        isBase && "border-accent-blue/30 bg-accent-blue/[0.02]"
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-text-primary">
              {scenario.name}
            </h3>
            {isBase && (
              <span className="rounded bg-accent-blue/15 px-1.5 py-0.5 text-2xs font-semibold text-accent-blue">
                BASE CASE
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <DirectionBadge direction={scenario.direction} />
            <RiskBadge level={scenario.risk_level} />
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-bold text-text-primary">
            {(scenario.probability * 100).toFixed(0)}%
          </p>
          <p className="text-2xs text-text-tertiary">probability</p>
        </div>
      </div>

      <p className="text-xs text-text-secondary leading-relaxed mb-4">
        {scenario.notes}
      </p>

      {/* Drivers */}
      <div className="mb-4">
        <p className="text-2xs font-medium uppercase tracking-wider text-text-tertiary mb-2">
          Key Drivers
        </p>
        <div className="space-y-1">
          {scenario.drivers.map((d, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-text-secondary">
              <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-accent-blue" />
              {d}
            </div>
          ))}
        </div>
      </div>

      {/* Invalidation */}
      <div className="mb-4">
        <p className="text-2xs font-medium uppercase tracking-wider text-text-tertiary mb-2">
          Invalidation Conditions
        </p>
        <div className="space-y-1">
          {scenario.invalidation_conditions.map((c, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-text-secondary">
              <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-accent-red" />
              {c}
            </div>
          ))}
        </div>
      </div>

      {/* Actor reactions */}
      <div>
        <p className="text-2xs font-medium uppercase tracking-wider text-text-tertiary mb-2">
          Expected Actor Reactions
        </p>
        <div className="space-y-2">
          {scenario.actor_reactions.map((r, i) => (
            <div
              key={i}
              className="rounded-md bg-surface-2 px-3 py-2"
            >
              <p className="text-2xs font-semibold text-text-primary mb-0.5">
                {formatArchetype(r.actor_archetype)}
              </p>
              <p className="text-xs text-text-tertiary">
                {r.expected_behavior}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
