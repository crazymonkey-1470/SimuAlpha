import Link from "next/link";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge, BiasBadge, DirectionBadge, RiskBadge } from "@/components/ui/badge";
import { ConfidenceBar } from "@/components/ui/confidence-bar";
import { PressureBar } from "@/components/ui/pressure-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, formatArchetype } from "@/lib/utils";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

const AVAILABLE_DATES = ["2025-03-18", "2025-03-19", "2025-03-20", "2025-03-21"];

interface ReplayPageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function ReplayPage({ searchParams }: ReplayPageProps) {
  const params = await searchParams;
  const date = AVAILABLE_DATES.includes(params.date ?? "")
    ? params.date!
    : AVAILABLE_DATES[0];
  const frame = await api.replay.frame(date);

  return (
    <>
      <Topbar
        title="Replay Analysis"
        subtitle="Historical simulation snapshots and outcome evaluation"
      />
      <div className="p-6 space-y-6">
        {/* Date selector */}
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="mb-1">Replay Frame</CardTitle>
              <p className="text-xs text-text-tertiary">
                Review what the simulation believed and what actually happened
              </p>
            </div>
            <nav className="flex gap-2" aria-label="Select replay date">
              {AVAILABLE_DATES.map((d) => (
                <Link
                  key={d}
                  href={`/replay?date=${d}`}
                  className={cn(
                    "rounded-md border px-3 py-1.5 font-mono text-xs transition-colors",
                    d === date
                      ? "border-accent-blue/40 bg-accent-blue/10 text-accent-blue"
                      : "border-border-subtle text-text-tertiary hover:border-border-default hover:text-text-secondary"
                  )}
                  aria-current={d === date ? "page" : undefined}
                >
                  {d}
                </Link>
              ))}
            </nav>
          </div>
        </Card>

        {/* Regime at that time */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card>
            <CardTitle className="mb-3">Regime at Time</CardTitle>
            <Badge variant="regime" className="text-sm font-semibold px-3 py-1 mb-3">
              {frame.regime}
            </Badge>
            <ConfidenceBar
              value={frame.regime_confidence}
              label="Confidence"
              size="md"
              className="mb-3"
            />
            <PressureBar value={frame.net_pressure} />
          </Card>

          {/* Realized outcome */}
          <Card className="lg:col-span-2">
            <CardTitle className="mb-3">Realized Outcome</CardTitle>
            {frame.realized_outcome ? (
              <div className="rounded-md border border-accent-green/20 bg-accent-green/5 px-4 py-3 mb-4">
                <p className="text-sm text-text-primary leading-relaxed">
                  {frame.realized_outcome}
                </p>
              </div>
            ) : (
              <p className="text-sm text-text-tertiary italic mb-4">
                Outcome data not yet available for this date.
              </p>
            )}
            <CardTitle className="mb-2">Analyst Notes</CardTitle>
            <p className="text-xs text-text-secondary leading-relaxed">
              {frame.notes}
            </p>
          </Card>
        </div>

        {/* Actor states at that time */}
        <Card>
          <CardTitle className="mb-4">
            Actor States — {frame.date}
          </CardTitle>
          {frame.actor_states.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {frame.actor_states.map((actor) => (
                <div
                  key={actor.id}
                  className="rounded-md border border-border-subtle bg-surface-2 p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-xs font-semibold text-text-primary">
                        {actor.name}
                      </p>
                      <p className="text-2xs text-text-tertiary">
                        {formatArchetype(actor.archetype)}
                      </p>
                    </div>
                    <BiasBadge bias={actor.bias} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <p className="text-2xs text-text-tertiary">Contribution</p>
                      <p
                        className={cn(
                          "font-mono text-xs font-semibold",
                          actor.contribution >= 0
                            ? "text-accent-green"
                            : "text-accent-red"
                        )}
                      >
                        {actor.contribution >= 0 ? "+" : ""}
                        {(actor.contribution * 100).toFixed(0)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-2xs text-text-tertiary">Conviction</p>
                      <p className="font-mono text-xs text-text-primary">
                        {(actor.conviction * 100).toFixed(0)}%
                      </p>
                    </div>
                  </div>
                  <p className="text-2xs text-text-tertiary">{actor.recent_change}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No actor data"
              description="Actor state data is not available for this replay frame."
            />
          )}
        </Card>

        {/* Scenarios at that time */}
        <Card>
          <CardTitle className="mb-4">
            Scenario Branches — {frame.date}
          </CardTitle>
          {frame.scenario_branches.length > 0 ? (
            <div className="space-y-3">
              {frame.scenario_branches.map((s) => (
                <div
                  key={s.id}
                  className="rounded-md border border-border-subtle bg-surface-2 p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-text-primary">
                        {s.name}
                      </p>
                      <DirectionBadge direction={s.direction} />
                      <RiskBadge level={s.risk_level} />
                    </div>
                    <span className="font-mono text-lg font-bold text-text-primary">
                      {(s.probability * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary">{s.notes}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No scenario data"
              description="Scenario branch data is not available for this replay frame."
            />
          )}
        </Card>
      </div>
    </>
  );
}
