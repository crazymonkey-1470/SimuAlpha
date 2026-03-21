import { Topbar } from "@/components/layout/topbar";
import { Card, CardTitle } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function SystemPage() {
  const [status, runs, replays, calibrations] = await Promise.all([
    api.system.status(),
    api.runs.list(10),
    api.replays.list(5),
    api.calibrations.list(5),
  ]);

  const statusItems = [
    {
      label: "API Status",
      value: status.api_status,
      status: status.api_status === "operational" ? "operational" as const : "error" as const,
    },
    {
      label: "Worker Status",
      value: status.worker_status,
      status: status.worker_status === "idle" ? "idle" as const : status.worker_status === "running" ? "healthy" as const : "error" as const,
    },
    {
      label: "Calibration",
      value: status.calibration_status,
      status: status.calibration_status.startsWith("calibrated") || status.calibration_status.startsWith("last") ? "healthy" as const : "warning" as const,
    },
  ];

  return (
    <>
      <Topbar
        title="System Status"
        subtitle="Operational diagnostics, run history, and service health"
      />
      <div className="p-6 space-y-6">
        {/* Status overview */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {statusItems.map((item) => (
            <Card key={item.label}>
              <div className="flex items-center justify-between mb-2">
                <CardTitle>{item.label}</CardTitle>
                <StatusDot status={item.status} />
              </div>
              <p className="text-sm font-medium text-text-primary">
                {item.value}
              </p>
            </Card>
          ))}
        </div>

        {/* Detailed status */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardTitle className="mb-4">Service Details</CardTitle>
            <div className="space-y-4">
              <StatusRow
                label="Data Freshness"
                value={status.data_freshness}
              />
              <StatusRow
                label="Last Simulation Run"
                value={
                  status.last_simulation_run
                    ? new Date(status.last_simulation_run).toLocaleString(
                        "en-US",
                        {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZoneName: "short",
                        }
                      )
                    : "No runs recorded"
                }
              />
              <StatusRow
                label="Active Model Version"
                value={status.active_model_version}
                mono
              />
              <StatusRow
                label="Calibration Status"
                value={status.calibration_status}
              />
              <StatusRow
                label="Worker Status"
                value={status.worker_status}
              />
            </div>
          </Card>

          <Card>
            <CardTitle className="mb-4">Warnings & Advisories</CardTitle>
            {status.warnings.length > 0 ? (
              <div className="space-y-2">
                {status.warnings.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-md border border-accent-amber/20 bg-accent-amber/5 px-4 py-3"
                  >
                    <span className="mt-0.5 text-accent-amber">
                      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M8 2L1.5 13h13L8 2z" />
                        <line x1="8" y1="6.5" x2="8" y2="9.5" />
                        <circle cx="8" cy="11.5" r="0.5" fill="currentColor" />
                      </svg>
                    </span>
                    <p className="text-xs text-text-secondary leading-relaxed">
                      {w}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-md bg-accent-green/5 border border-accent-green/20 px-4 py-3">
                <StatusDot status="healthy" />
                <p className="text-xs text-text-secondary">
                  No active warnings. All systems nominal.
                </p>
              </div>
            )}
          </Card>
        </div>

        {/* Recent Simulation Runs */}
        <Card>
          <CardTitle className="mb-4">Recent Simulation Runs</CardTitle>
          {runs.runs.length > 0 ? (
            <div className="-mx-5 -mb-5 overflow-x-auto">
              <table className="w-full min-w-[640px] text-xs">
                <thead>
                  <tr className="border-t border-border-subtle bg-surface-2 text-text-tertiary">
                    <th className="py-2.5 pl-5 pr-3 text-left font-medium">Run ID</th>
                    <th className="px-3 py-2.5 text-left font-medium">Type</th>
                    <th className="px-3 py-2.5 text-left font-medium">Status</th>
                    <th className="px-3 py-2.5 text-left font-medium">Source</th>
                    <th className="px-3 py-2.5 text-left font-medium">Created</th>
                    <th className="py-2.5 pl-3 pr-5 text-left font-medium">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.runs.map((run) => (
                    <tr
                      key={run.id}
                      className="border-t border-border-subtle hover:bg-surface-2/50 transition-colors"
                    >
                      <td className="py-3 pl-5 pr-3 font-mono text-text-tertiary">
                        {run.id.slice(0, 8)}...
                      </td>
                      <td className="px-3 py-3 text-text-secondary">{run.run_type}</td>
                      <td className="px-3 py-3">
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="px-3 py-3 text-text-secondary">{run.source}</td>
                      <td className="px-3 py-3 font-mono text-text-tertiary">
                        {new Date(run.created_at).toLocaleString("en-US", {
                          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </td>
                      <td className="py-3 pl-3 pr-5 text-text-tertiary max-w-[300px] truncate">
                        {run.summary || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-text-tertiary">No simulation runs recorded yet.</p>
          )}
        </Card>

        {/* Recent Replay Runs */}
        <Card>
          <CardTitle className="mb-4">Recent Replay Runs</CardTitle>
          {replays.runs.length > 0 ? (
            <div className="space-y-2">
              {replays.runs.map((run) => (
                <div key={run.id} className="flex items-center justify-between rounded-md border border-border-subtle bg-surface-2 px-4 py-3">
                  <div>
                    <p className="text-xs font-medium text-text-primary">
                      {run.start_date} to {run.end_date}
                    </p>
                    <p className="text-2xs text-text-tertiary">
                      {run.frame_count ?? 0} frames · {run.summary || "—"}
                    </p>
                  </div>
                  <StatusBadge status={run.status} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-tertiary">No replay runs recorded yet.</p>
          )}
        </Card>

        {/* Recent Calibrations */}
        <Card>
          <CardTitle className="mb-4">Recent Calibrations</CardTitle>
          {calibrations.runs.length > 0 ? (
            <div className="space-y-2">
              {calibrations.runs.map((run) => (
                <div key={run.id} className="flex items-center justify-between rounded-md border border-border-subtle bg-surface-2 px-4 py-3">
                  <div>
                    <p className="text-xs font-medium text-text-primary">
                      {run.period_name || "Custom"}: {run.start_date} to {run.end_date}
                    </p>
                    <p className="text-2xs text-text-tertiary">
                      {run.summary || "—"}
                    </p>
                  </div>
                  <StatusBadge status={run.status} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-tertiary">No calibration runs recorded yet.</p>
          )}
        </Card>

        {/* Infrastructure */}
        <Card>
          <CardTitle className="mb-4">Infrastructure</CardTitle>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <InfraCard
              name="API Service"
              provider="Railway"
              status="operational"
              detail="FastAPI · Python 3.11 · PostgreSQL"
            />
            <InfraCard
              name="Database"
              provider="PostgreSQL"
              status="operational"
              detail="SQLAlchemy 2.x · Alembic migrations"
            />
            <InfraCard
              name="Frontend"
              provider="Cloudflare"
              status="operational"
              detail="Next.js · Edge deployment"
            />
          </div>
        </Card>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: "bg-accent-green/10 text-accent-green border-accent-green/20",
    running: "bg-accent-blue/10 text-accent-blue border-accent-blue/20",
    pending: "bg-surface-3 text-text-tertiary border-border-subtle",
    failed: "bg-accent-red/10 text-accent-red border-accent-red/20",
    queued: "bg-accent-amber/10 text-accent-amber border-accent-amber/20",
  };
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-2xs font-medium", colors[status] ?? colors.pending)}>
      {status}
    </span>
  );
}

function StatusRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border-subtle pb-3 last:border-0 last:pb-0">
      <span className="text-xs text-text-tertiary flex-shrink-0">{label}</span>
      <span
        className={cn("text-xs text-text-primary text-right", mono && "font-mono")}
      >
        {value}
      </span>
    </div>
  );
}

function InfraCard({
  name,
  provider,
  status,
  detail,
}: {
  name: string;
  provider: string;
  status: "operational" | "warning" | "error";
  detail: string;
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-surface-2 p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-text-primary">{name}</p>
        <StatusDot status={status} />
      </div>
      <p className="text-2xs text-accent-blue font-medium mb-1">{provider}</p>
      <p className="text-2xs text-text-tertiary">{detail}</p>
    </div>
  );
}
