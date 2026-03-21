"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, BiasBadge, RiskBadge } from "@/components/ui/badge";
import { ConfidenceBar } from "@/components/ui/confidence-bar";
import { PressureBar } from "@/components/ui/pressure-bar";
import { MetricBlock } from "@/components/ui/metric-block";
import { api } from "@/lib/api";
import { biasColor, cn, formatArchetype, pct } from "@/lib/utils";
import type {
  SymbolOverview,
  SymbolHistoryResponse,
  SymbolReplayResponse,
  ActorStateResponse,
  ScenarioResponse,
} from "@/lib/types";

type Tab = "overview" | "actors" | "scenarios" | "history" | "replay";

export default function SymbolDetailPage() {
  const params = useParams();
  const symbol = (params.symbol as string)?.toUpperCase() ?? "";
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<SymbolOverview | null>(null);
  const [history, setHistory] = useState<SymbolHistoryResponse | null>(null);
  const [replay, setReplay] = useState<SymbolReplayResponse | null>(null);
  const [actors, setActors] = useState<ActorStateResponse | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!symbol) return;
    api.symbols.overview(symbol).then((d) => {
      setOverview(d);
      setLoading(false);
    });
  }, [symbol]);

  useEffect(() => {
    if (!symbol) return;
    if (tab === "history" && !history) api.symbols.history(symbol).then(setHistory);
    if (tab === "replay" && !replay) api.symbols.replay(symbol).then(setReplay);
    if (tab === "actors" && !actors) api.symbols.actors(symbol).then(setActors);
    if (tab === "scenarios" && !scenarios) api.symbols.scenarios(symbol).then(setScenarios);
  }, [tab, symbol, history, replay, actors, scenarios]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "actors", label: "Actors" },
    { key: "scenarios", label: "Scenarios" },
    { key: "history", label: "History" },
    { key: "replay", label: "Replay" },
  ];

  const staleness = overview?.last_simulation_at
    ? `Last simulation ${new Date(overview.last_simulation_at).toLocaleString()}`
    : "No simulation data";

  return (
    <>
      <Topbar title={symbol} subtitle={staleness} />
      <div className="p-6 space-y-6">
        {/* Tab navigation */}
        <div className="flex gap-1 border-b border-border-subtle pb-px">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "px-3 py-2 text-xs font-medium transition-colors rounded-t-md",
                tab === t.key
                  ? "border-b-2 border-accent-blue text-accent-blue"
                  : "text-text-tertiary hover:text-text-secondary"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <Card><p className="text-xs text-text-tertiary">Loading symbol data...</p></Card>
        ) : tab === "overview" ? (
          <OverviewTab overview={overview} />
        ) : tab === "actors" ? (
          <ActorsTab actors={actors} />
        ) : tab === "scenarios" ? (
          <ScenariosTab scenarios={scenarios} />
        ) : tab === "history" ? (
          <HistoryTab history={history} />
        ) : tab === "replay" ? (
          <ReplayTab replay={replay} />
        ) : null}
      </div>
    </>
  );
}

// ── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ overview }: { overview: SymbolOverview | null }) {
  if (!overview) return <Card><p className="text-xs text-text-tertiary">No data available.</p></Card>;

  return (
    <div className="space-y-6">
      {/* Top metrics row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <MetricBlock
            label="Regime"
            value={overview.regime?.regime ?? "Unknown"}
            sub={overview.regime ? `${Math.round(overview.regime.confidence * 100)}% confidence` : undefined}
          />
        </Card>
        <Card>
          <MetricBlock
            label="Signal"
            value={overview.signal?.bias ?? "N/A"}
            valueClass={biasColor(overview.signal?.bias ?? "")}
            sub={overview.signal?.suggested_posture}
          />
        </Card>
        <Card>
          <MetricBlock
            label="Fragility"
            value={overview.fragility}
            valueClass={
              overview.fragility === "high" ? "text-accent-red"
              : overview.fragility === "elevated" ? "text-orange-400"
              : overview.fragility === "moderate" ? "text-accent-amber"
              : "text-accent-green"
            }
            sub={`${overview.warning_count} warning${overview.warning_count !== 1 ? "s" : ""}`}
          />
        </Card>
        <Card>
          <MetricBlock
            label="Dominant Actor"
            value={overview.dominant_actor ?? "N/A"}
            sub={overview.signal?.time_horizon}
          />
        </Card>
      </div>

      {/* Regime detail */}
      {overview.regime && (
        <Card>
          <CardHeader>
            <CardTitle>Regime Analysis</CardTitle>
            <Badge variant="regime">{overview.regime.regime}</Badge>
          </CardHeader>
          <p className="mb-4 text-xs text-text-secondary leading-relaxed">{overview.regime.summary}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <ConfidenceBar value={overview.regime.confidence} label="Confidence" size="md" />
            <PressureBar value={overview.regime.net_pressure} />
          </div>
          {overview.regime.risk_flags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {overview.regime.risk_flags.map((f, i) => (
                <span key={i} className="rounded-md bg-accent-red/10 px-2 py-0.5 text-2xs text-accent-red">{f}</span>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Signal detail */}
      {overview.signal && (
        <Card>
          <CardHeader>
            <CardTitle>Signal Output</CardTitle>
            <BiasBadge bias={overview.signal.bias} />
          </CardHeader>
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricBlock label="Confidence" value={`${Math.round(overview.signal.confidence * 100)}%`} />
            <MetricBlock label="Time Horizon" value={overview.signal.time_horizon} />
            <MetricBlock label="Posture" value={overview.signal.suggested_posture} />
          </div>
          {overview.signal.change_vs_prior && (
            <p className="mt-3 text-2xs text-text-tertiary">{overview.signal.change_vs_prior}</p>
          )}
          {overview.signal.warnings.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {overview.signal.warnings.map((w, i) => (
                <span key={i} className="rounded-md bg-accent-amber/10 px-2 py-0.5 text-2xs text-accent-amber">{w}</span>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Actor summary */}
      {overview.actors.length > 0 && (
        <Card>
          <CardTitle className="mb-3">Actor Contributions</CardTitle>
          <div className="space-y-2">
            {overview.actors
              .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
              .map((a, i) => (
                <div key={i} className="flex items-center justify-between border-b border-border-subtle pb-2 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-text-primary">{a.name}</span>
                    <span className="text-2xs text-text-tertiary">{formatArchetype(a.archetype)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <BiasBadge bias={a.bias} />
                    <span className={cn("font-mono text-xs", biasColor(a.contribution >= 0 ? "bullish" : "bearish"))}>
                      {pct(a.contribution)}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* Scenario summary */}
      {overview.scenarios.length > 0 && (
        <Card>
          <CardTitle className="mb-3">Scenario Branches</CardTitle>
          <div className="space-y-2">
            {overview.scenarios.map((s, i) => (
              <div key={i} className="flex items-center justify-between border-b border-border-subtle pb-2 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text-primary">{s.name}</span>
                  {s.is_base_case && <Badge variant="regime">Base</Badge>}
                </div>
                <div className="flex items-center gap-3">
                  <RiskBadge level={s.risk_level} />
                  <span className="font-mono text-xs text-text-secondary">{Math.round(s.probability * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Actors Tab ───────────────────────────────────────────────────────────────

function ActorsTab({ actors }: { actors: ActorStateResponse | null }) {
  if (!actors || actors.actors.length === 0) {
    return <Card><p className="text-xs text-text-tertiary">No actor data available.</p></Card>;
  }
  return (
    <div className="space-y-4">
      {actors.actors.map((a) => (
        <Card key={a.id}>
          <CardHeader>
            <div>
              <h4 className="text-sm font-semibold text-text-primary">{a.name}</h4>
              <p className="text-2xs text-text-tertiary">{formatArchetype(a.archetype)} &middot; {a.horizon}</p>
            </div>
            <BiasBadge bias={a.bias} />
          </CardHeader>
          <div className="grid gap-3 sm:grid-cols-3 mb-3">
            <ConfidenceBar value={a.conviction} label="Conviction" />
            <ConfidenceBar value={a.confidence} label="Confidence" />
            <div>
              <p className="text-2xs text-text-tertiary mb-1">Contribution</p>
              <span className={cn("font-mono text-sm font-semibold", biasColor(a.contribution >= 0 ? "bullish" : "bearish"))}>
                {pct(a.contribution)}
              </span>
            </div>
          </div>
          {a.recent_change && (
            <p className="text-2xs text-text-tertiary">{a.recent_change}</p>
          )}
        </Card>
      ))}
    </div>
  );
}

// ── Scenarios Tab ────────────────────────────────────────────────────────────

function ScenariosTab({ scenarios }: { scenarios: ScenarioResponse | null }) {
  if (!scenarios || scenarios.scenarios.length === 0) {
    return <Card><p className="text-xs text-text-tertiary">No scenario data available.</p></Card>;
  }
  return (
    <div className="space-y-4">
      {scenarios.scenarios.map((s) => (
        <Card key={s.id}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-text-primary">{s.name}</h4>
              {s.id === scenarios.base_case_id && <Badge variant="regime">Base Case</Badge>}
            </div>
            <span className="font-mono text-sm font-semibold text-text-primary">{Math.round(s.probability * 100)}%</span>
          </CardHeader>
          <div className="grid gap-3 sm:grid-cols-3 mb-3">
            <MetricBlock label="Direction" value={s.direction} valueClass={biasColor(s.direction)} />
            <MetricBlock label="Risk Level" value={s.risk_level} />
            <MetricBlock label="Probability" value={`${Math.round(s.probability * 100)}%`} />
          </div>
          {s.drivers.length > 0 && (
            <div className="mb-2">
              <p className="text-2xs font-medium text-text-tertiary mb-1">Drivers</p>
              <div className="flex flex-wrap gap-1.5">
                {s.drivers.map((d, i) => <Badge key={i}>{d}</Badge>)}
              </div>
            </div>
          )}
          {s.notes && <p className="text-2xs text-text-tertiary">{s.notes}</p>}
        </Card>
      ))}
    </div>
  );
}

// ── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab({ history }: { history: SymbolHistoryResponse | null }) {
  if (!history || history.entries.length === 0) {
    return <Card><p className="text-xs text-text-tertiary">No history available.</p></Card>;
  }
  return (
    <Card>
      <CardTitle className="mb-3">Regime &amp; Signal Timeline</CardTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-subtle text-left text-text-tertiary">
              <th className="pb-2 pr-4 font-medium">Date</th>
              <th className="pb-2 pr-4 font-medium">Regime</th>
              <th className="pb-2 pr-4 font-medium">Confidence</th>
              <th className="pb-2 pr-4 font-medium">Pressure</th>
              <th className="pb-2 pr-4 font-medium">Signal</th>
              <th className="pb-2 font-medium">Signal Conf.</th>
            </tr>
          </thead>
          <tbody>
            {history.entries.map((e, i) => (
              <tr key={i} className="border-b border-border-subtle last:border-0">
                <td className="py-2 pr-4 font-mono text-text-secondary">{e.date}</td>
                <td className="py-2 pr-4"><Badge variant="regime">{e.regime}</Badge></td>
                <td className="py-2 pr-4 font-mono text-text-secondary">{Math.round(e.regime_confidence * 100)}%</td>
                <td className={cn("py-2 pr-4 font-mono", biasColor(e.net_pressure >= 0 ? "bullish" : "bearish"))}>{e.net_pressure >= 0 ? "+" : ""}{e.net_pressure.toFixed(2)}</td>
                <td className="py-2 pr-4">{e.signal_bias ? <BiasBadge bias={e.signal_bias} /> : <span className="text-text-tertiary">—</span>}</td>
                <td className="py-2 font-mono text-text-secondary">{e.signal_confidence != null ? `${Math.round(e.signal_confidence * 100)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Replay Tab ───────────────────────────────────────────────────────────────

function ReplayTab({ replay }: { replay: SymbolReplayResponse | null }) {
  if (!replay || replay.frames.length === 0) {
    return <Card><p className="text-xs text-text-tertiary">No replay frames available.</p></Card>;
  }
  return (
    <div className="space-y-3">
      <Card>
        <CardTitle className="mb-1">Replay Frames</CardTitle>
        <p className="text-2xs text-text-tertiary mb-3">{replay.total} frames for {replay.symbol}</p>
      </Card>
      {replay.frames.map((f, i) => (
        <Card key={i}>
          <div className="flex items-start justify-between mb-2">
            <div>
              <span className="font-mono text-sm font-semibold text-text-primary">{f.date}</span>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="regime">{f.regime}</Badge>
                {f.signal_bias && <BiasBadge bias={f.signal_bias} />}
              </div>
            </div>
            <div className="text-right">
              <span className="font-mono text-xs text-text-secondary">{Math.round(f.regime_confidence * 100)}%</span>
              <p className={cn("font-mono text-xs", biasColor(f.net_pressure >= 0 ? "bullish" : "bearish"))}>
                {f.net_pressure >= 0 ? "+" : ""}{f.net_pressure.toFixed(2)}
              </p>
            </div>
          </div>
          {f.realized_outcome && (
            <p className="text-2xs text-accent-blue mb-1">Outcome: {f.realized_outcome}</p>
          )}
          {f.notes && <p className="text-2xs text-text-tertiary">{f.notes}</p>}
        </Card>
      ))}
    </div>
  );
}
