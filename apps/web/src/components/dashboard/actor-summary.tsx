import type { ActorState } from "@/lib/types";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { BiasBadge } from "@/components/ui/badge";
import { cn, formatArchetype } from "@/lib/utils";
import Link from "next/link";

export function ActorSummary({ actors }: { actors: ActorState[] }) {
  const sorted = [...actors].sort(
    (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dominant Actors</CardTitle>
        <Link
          href="/actors"
          className="text-2xs text-text-tertiary hover:text-accent-blue transition-colors"
        >
          All {actors.length} →
        </Link>
      </CardHeader>

      <div className="space-y-2.5">
        {sorted.slice(0, 5).map((actor) => (
          <div
            key={actor.id}
            className="flex items-center gap-3 rounded-md bg-surface-2 px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-xs font-medium text-text-primary">
                  {actor.name}
                </p>
                <BiasBadge bias={actor.bias} />
              </div>
              <p className="mt-0.5 text-2xs text-text-tertiary">
                {formatArchetype(actor.archetype)} · {actor.horizon}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p
                className={cn(
                  "font-mono text-sm font-semibold",
                  actor.contribution >= 0
                    ? "text-accent-green"
                    : "text-accent-red"
                )}
              >
                {actor.contribution >= 0 ? "+" : ""}
                {(actor.contribution * 100).toFixed(0)}%
              </p>
              <p className="text-2xs text-text-tertiary">contribution</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
