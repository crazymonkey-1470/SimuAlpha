"use client";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardTitle } from "@/components/ui/card";
import { BiasBadge } from "@/components/ui/badge";
import { ConfidenceBar } from "@/components/ui/confidence-bar";
import { cn, formatArchetype } from "@/lib/utils";
import { api } from "@/lib/api";
import { useApiData } from "@/lib/use-api-data";
import type { ActorState } from "@/lib/types";

export default function ActorsPage() {
  const { data, loading } = useApiData(() => api.actors.current());

  if (loading || !data) {
    return (
      <>
        <Topbar title="Actor Simulation" subtitle="Loading…" />
        <div className="p-6 text-sm text-text-tertiary">Loading…</div>
      </>
    );
  }

  return (
    <>
      <Topbar
        title="Actor Simulation"
        subtitle={`${data.actor_count} simulated actor classes`}
      />
      <div className="p-6 space-y-6">
        {/* Aggregate view */}
        <Card>
          <CardTitle className="mb-3">Aggregate Flow Contribution</CardTitle>
          <div className="flex items-center gap-1 h-8 rounded-md overflow-hidden">
            {data.actors
              .filter((a) => a.contribution !== 0)
              .sort((a, b) => b.contribution - a.contribution)
              .map((actor) => {
                const width = Math.max(Math.abs(actor.contribution) * 200, 8);
                return (
                  <div
                    key={actor.id}
                    className={cn(
                      "h-full rounded-sm flex items-center justify-center text-2xs font-medium text-surface-0",
                      actor.contribution >= 0
                        ? "bg-accent-green/70"
                        : "bg-accent-red/70"
                    )}
                    style={{ width: `${width}%` }}
                    title={`${actor.name}: ${actor.contribution >= 0 ? "+" : ""}${(actor.contribution * 100).toFixed(0)}%`}
                  >
                    {width > 15 && (
                      <span className="truncate px-1">
                        {actor.name.split(" ")[0]}
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
          <div className="mt-2 flex justify-between text-2xs text-text-tertiary">
            <span>Bearish pressure</span>
            <span>Bullish pressure</span>
          </div>
        </Card>

        {/* Actor grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.actors.map((actor) => (
            <ActorCard key={actor.id} actor={actor} />
          ))}
        </div>
      </div>
    </>
  );
}

function ActorCard({ actor }: { actor: ActorState }) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            {actor.name}
          </h3>
          <p className="text-2xs text-text-tertiary mt-0.5">
            {formatArchetype(actor.archetype)}
          </p>
        </div>
        <BiasBadge bias={actor.bias} />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <p className="text-2xs text-text-tertiary">Contribution</p>
          <p
            className={cn(
              "font-mono text-sm font-semibold",
              actor.contribution >= 0 ? "text-accent-green" : "text-accent-red"
            )}
          >
            {actor.contribution >= 0 ? "+" : ""}
            {(actor.contribution * 100).toFixed(0)}%
          </p>
        </div>
        <div>
          <p className="text-2xs text-text-tertiary">Horizon</p>
          <p className="text-xs text-text-primary">{actor.horizon}</p>
        </div>
      </div>

      <ConfidenceBar value={actor.conviction} label="Conviction" className="mb-2" />
      <ConfidenceBar value={actor.confidence} label="Model confidence" className="mb-4" />

      {/* Sensitivities */}
      <div className="mb-3">
        <p className="text-2xs font-medium uppercase tracking-wider text-text-tertiary mb-1.5">
          Sensitivities
        </p>
        <div className="flex flex-wrap gap-1.5">
          {actor.sensitivities.map((s) => (
            <span
              key={s.factor}
              className={cn(
                "rounded px-1.5 py-0.5 text-2xs font-medium",
                s.weight >= 0
                  ? "bg-accent-blue/10 text-accent-blue"
                  : "bg-accent-red/10 text-accent-red"
              )}
            >
              {s.factor}{" "}
              <span className="font-mono">
                {s.weight >= 0 ? "+" : ""}
                {s.weight.toFixed(2)}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Recent change */}
      <div className="mt-auto rounded-md bg-surface-2 px-3 py-2">
        <p className="text-2xs font-medium text-text-tertiary mb-0.5">
          Recent Change
        </p>
        <p className="text-xs text-text-secondary leading-relaxed">
          {actor.recent_change}
        </p>
      </div>
    </Card>
  );
}
