import { Topbar } from "@/components/layout/topbar";
import { Card, CardTitle } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function SystemPage() {
  const status = await api.system.status();

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
      status: status.calibration_status.startsWith("calibrated") ? "healthy" as const : "warning" as const,
    },
  ];

  return (
    <>
      <Topbar
        title="System Status"
        subtitle="Operational diagnostics and service health"
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

        {/* Infrastructure */}
        <Card>
          <CardTitle className="mb-4">Infrastructure</CardTitle>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
              detail="PostgreSQL · Connection pooling enabled"
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
