import { Topbar } from "@/components/layout/topbar";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function SystemPage() {
  const [status, queueStatus, workerHealth, schedules, recentJobs] =
    await Promise.all([
      api.system.status(),
      api.queue.status(),
      api.queue.workerHealth(),
      api.queue.schedules(),
      api.jobs.list(20),
    ]);

  const statusItems = [
    {
      label: "API Status",
      value: status.api_status,
      status:
        status.api_status === "operational"
          ? ("operational" as const)
          : ("error" as const),
    },
    {
      label: "Worker Status",
      value: status.worker_status,
      status:
        status.worker_status === "idle"
          ? ("idle" as const)
          : status.worker_status === "running"
            ? ("healthy" as const)
            : ("error" as const),
    },
    {
      label: "Calibration",
      value: status.calibration_status,
      status: status.calibration_status.startsWith("calibrated")
        ? ("healthy" as const)
        : ("warning" as const),
    },
  ];

  return (
    <>
      <Topbar
        title="System Status"
        subtitle="Operational diagnostics, queue health, and job monitoring"
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

        {/* Queue & Worker status */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Queue status */}
          <Card>
            <CardHeader>
              <CardTitle>Queue Status</CardTitle>
              <StatusDot
                status={queueStatus.redis_connected ? "operational" : "error"}
                label={queueStatus.redis_connected ? "Redis connected" : "Redis offline"}
              />
            </CardHeader>
            {queueStatus.redis_connected ? (
              <>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="rounded-md bg-surface-2 px-3 py-2.5 text-center">
                    <p className="font-mono text-lg font-bold text-text-primary">
                      {queueStatus.total_pending}
                    </p>
                    <p className="text-2xs text-text-tertiary">Pending</p>
                  </div>
                  <div className="rounded-md bg-surface-2 px-3 py-2.5 text-center">
                    <p className="font-mono text-lg font-bold text-accent-blue">
                      {queueStatus.total_active}
                    </p>
                    <p className="text-2xs text-text-tertiary">Active</p>
                  </div>
                  <div className="rounded-md bg-surface-2 px-3 py-2.5 text-center">
                    <p
                      className={cn(
                        "font-mono text-lg font-bold",
                        queueStatus.total_failed > 0
                          ? "text-accent-red"
                          : "text-text-primary"
                      )}
                    >
                      {queueStatus.total_failed}
                    </p>
                    <p className="text-2xs text-text-tertiary">Failed</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {queueStatus.queues.map((q) => (
                    <div
                      key={q.name}
                      className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-2"
                    >
                      <span className="font-mono text-xs text-text-secondary">
                        {q.name}
                      </span>
                      <div className="flex items-center gap-3 text-2xs">
                        <span className="text-text-tertiary">
                          {q.pending} pending
                        </span>
                        <span className="text-accent-blue">
                          {q.active} active
                        </span>
                        {q.failed > 0 && (
                          <span className="text-accent-red">
                            {q.failed} failed
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 rounded-md bg-accent-red/5 border border-accent-red/20 px-4 py-3">
                <StatusDot status="error" />
                <p className="text-xs text-text-secondary">
                  Redis is not connected. Queue operations are unavailable.
                </p>
              </div>
            )}
          </Card>

          {/* Worker health */}
          <Card>
            <CardHeader>
              <CardTitle>Worker Health</CardTitle>
              <span className="text-2xs text-text-tertiary">
                {workerHealth.worker_count} worker
                {workerHealth.worker_count !== 1 ? "s" : ""}
              </span>
            </CardHeader>
            {workerHealth.workers.length > 0 ? (
              <div className="space-y-2">
                {workerHealth.workers.map((w) => (
                  <div
                    key={w.name}
                    className="rounded-md border border-border-subtle bg-surface-2 p-3"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs text-text-primary">
                        {w.name}
                      </span>
                      <Badge
                        variant={w.state === "busy" ? "regime" : "default"}
                        className="text-2xs"
                      >
                        {w.state}
                      </Badge>
                    </div>
                    <div className="text-2xs text-text-tertiary">
                      {w.queues.join(", ")}
                    </div>
                    {w.current_job && (
                      <p className="mt-1 text-2xs text-accent-blue">
                        Running: {w.current_job}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-md bg-accent-amber/5 border border-accent-amber/20 px-4 py-3">
                <StatusDot status="warning" />
                <p className="text-xs text-text-secondary">
                  No workers detected. Start a worker with:{" "}
                  <code className="font-mono text-2xs">
                    python -m worker.main worker
                  </code>
                </p>
              </div>
            )}
          </Card>
        </div>

        {/* Recent jobs */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Jobs</CardTitle>
            <span className="text-2xs text-text-tertiary">
              {recentJobs.total} jobs
            </span>
          </CardHeader>
          {recentJobs.jobs.length > 0 ? (
            <div className="-mx-5 -mb-5 overflow-x-auto">
              <table className="w-full min-w-[700px] text-xs">
                <thead>
                  <tr className="border-t border-border-subtle bg-surface-2 text-text-tertiary">
                    <th className="py-2.5 pl-5 pr-3 text-left font-medium">
                      Type
                    </th>
                    <th className="px-3 py-2.5 text-left font-medium">
                      Status
                    </th>
                    <th className="px-3 py-2.5 text-left font-medium">
                      Source
                    </th>
                    <th className="px-3 py-2.5 text-left font-medium">
                      Created
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      Duration
                    </th>
                    <th className="py-2.5 pl-3 pr-5 text-left font-medium">
                      Summary
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.jobs.map((job) => (
                    <tr
                      key={job.id}
                      className="border-t border-border-subtle hover:bg-surface-2/50 transition-colors"
                    >
                      <td className="py-3 pl-5 pr-3">
                        <span
                          className={cn(
                            "inline-flex rounded px-1.5 py-0.5 text-2xs font-medium",
                            job.job_type === "simulation" &&
                              "bg-accent-blue/10 text-accent-blue",
                            job.job_type === "replay" &&
                              "bg-accent-cyan/10 text-accent-cyan",
                            job.job_type === "calibration" &&
                              "bg-accent-amber/10 text-accent-amber",
                            job.job_type === "data_refresh" &&
                              "bg-accent-green/10 text-accent-green"
                          )}
                        >
                          {job.job_type}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 text-xs",
                            job.status === "completed" && "text-accent-green",
                            job.status === "failed" && "text-accent-red",
                            job.status === "running" && "text-accent-blue",
                            job.status === "pending" && "text-text-tertiary"
                          )}
                        >
                          <span
                            className={cn(
                              "inline-block h-1.5 w-1.5 rounded-full",
                              job.status === "completed" && "bg-accent-green",
                              job.status === "failed" && "bg-accent-red",
                              job.status === "running" &&
                                "bg-accent-blue animate-pulse",
                              job.status === "pending" && "bg-text-tertiary"
                            )}
                          />
                          {job.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-text-tertiary">
                        {job.source}
                      </td>
                      <td className="px-3 py-3 font-mono text-text-tertiary">
                        {new Date(job.created_at).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-text-secondary">
                        {job.duration_seconds != null
                          ? `${job.duration_seconds.toFixed(1)}s`
                          : "—"}
                      </td>
                      <td className="py-3 pl-3 pr-5 text-text-tertiary max-w-[280px] truncate">
                        {job.error_message || job.summary || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-text-tertiary">No jobs recorded yet.</p>
          )}
        </Card>

        {/* Scheduled jobs */}
        <Card>
          <CardHeader>
            <CardTitle>Scheduled Jobs</CardTitle>
            <StatusDot
              status={schedules.scheduler_running ? "operational" : "warning"}
              label={
                schedules.scheduler_running
                  ? "Scheduler active"
                  : "Scheduler not running"
              }
            />
          </CardHeader>
          {schedules.schedules.length > 0 ? (
            <div className="space-y-2">
              {schedules.schedules.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-md bg-surface-2 px-4 py-3"
                >
                  <div>
                    <p className="text-xs font-medium text-text-primary">
                      {s.description}
                    </p>
                    <p className="text-2xs text-text-tertiary mt-0.5">
                      {s.id} · {s.queue_name}
                    </p>
                  </div>
                  <span className="font-mono text-xs text-text-secondary bg-surface-3 rounded px-2 py-1">
                    {s.cron_string}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-tertiary">
              No schedule definitions available.
            </p>
          )}
        </Card>

        {/* Service details & Warnings */}
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
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M8 2L1.5 13h13L8 2z" />
                        <line x1="8" y1="6.5" x2="8" y2="9.5" />
                        <circle
                          cx="8"
                          cy="11.5"
                          r="0.5"
                          fill="currentColor"
                        />
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

        {/* Infrastructure */}
        <Card>
          <CardTitle className="mb-4">Infrastructure</CardTitle>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <InfraCard
              name="API Service"
              provider="Railway"
              status="operational"
              detail="FastAPI · Python 3.11"
            />
            <InfraCard
              name="Database"
              provider="Supabase"
              status="operational"
              detail="PostgreSQL · Connection pooling"
            />
            <InfraCard
              name="Redis"
              provider="Railway"
              status={queueStatus.redis_connected ? "operational" : "error"}
              detail="Job queue broker"
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
        className={cn(
          "text-xs text-text-primary text-right",
          mono && "font-mono"
        )}
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
