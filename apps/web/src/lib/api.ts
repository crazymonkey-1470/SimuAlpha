import type {
  ActorStateResponse,
  CalibrationRunListResponse,
  CrossAssetResponse,
  JobListResponse,
  JobStatusResponse,
  JobSubmitResponse,
  QueueStatusResponse,
  RegimeHistoryResponse,
  RegimeSnapshot,
  ReplayFrame,
  ReplayRunListResponse,
  RunListResponse,
  RunSummary,
  ScenarioResponse,
  ScheduleResponse,
  SignalHistoryResponse,
  SignalSummary,
  SimulationRunResponse,
  SystemStatus,
  WorkerHealthResponse,
} from "./types";
import * as mock from "./mock-data";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_PREFIX = "/api/v1";

async function fetchApi<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${API_PREFIX}${path}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

async function postApi<T>(path: string, body: unknown, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${API_PREFIX}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export const api = {
  regime: {
    current: () => fetchApi<RegimeSnapshot>("/regime/current", mock.regimeSnapshot),
    history: () => fetchApi<RegimeHistoryResponse>("/regime/history", mock.regimeHistory),
  },
  actors: {
    current: () => fetchApi<ActorStateResponse>("/actors/current", mock.actorResponse),
  },
  scenarios: {
    current: () => fetchApi<ScenarioResponse>("/scenarios/current", mock.scenarioResponse),
  },
  signals: {
    current: () => fetchApi<SignalSummary>("/signals/current", mock.signalSummary),
    history: () => fetchApi<SignalHistoryResponse>("/signals/history", mock.signalHistory),
  },
  context: {
    crossAsset: () => fetchApi<CrossAssetResponse>("/context/cross-asset", mock.crossAssetContext),
  },
  replay: {
    frame: (date: string) =>
      fetchApi<ReplayFrame>(`/replay/${date}`, mock.replayFrames[date] ?? mock.replayFrames["2025-03-18"]),
  },
  system: {
    status: () => fetchApi<SystemStatus>("/system/status", mock.systemStatus),
  },
  // ── New persisted-data endpoints ──────────────────────────────────────
  runs: {
    list: (limit = 20) =>
      fetchApi<RunListResponse>(`/runs?limit=${limit}`, { runs: [], total: 0 }),
    get: (runId: string) =>
      fetchApi<RunSummary>(`/runs/${runId}`, null as unknown as RunSummary),
  },
  replays: {
    list: (limit = 20) =>
      fetchApi<ReplayRunListResponse>(`/replays?limit=${limit}`, { runs: [], total: 0 }),
    trigger: (startDate: string, endDate: string) =>
      postApi<unknown>("/replays/run", { start_date: startDate, end_date: endDate }, null),
  },
  calibrations: {
    list: (limit = 20) =>
      fetchApi<CalibrationRunListResponse>(`/calibrations?limit=${limit}`, { runs: [], total: 0 }),
  },
  simulation: {
    run: () =>
      postApi<SimulationRunResponse>("/simulation/run", {}, {
        run_id: "",
        status: "failed",
        submitted_at: new Date().toISOString(),
        message: "Backend unavailable",
      }),
  },
  // ── Job queue endpoints ─────────────────────────────────────────────────
  jobs: {
    list: (limit = 20, status?: string, jobType?: string) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (status) params.set("status", status);
      if (jobType) params.set("job_type", jobType);
      return fetchApi<JobListResponse>(`/jobs?${params}`, { jobs: [], total: 0 });
    },
    get: (jobId: string) =>
      fetchApi<JobStatusResponse>(`/jobs/${jobId}`, null as unknown as JobStatusResponse),
    submitSimulation: (body: { seed?: number; use_real_data?: boolean } = {}) =>
      postApi<JobSubmitResponse>("/jobs/simulation", body, null as unknown as JobSubmitResponse),
    submitReplay: (body: { start_date: string; end_date: string }) =>
      postApi<JobSubmitResponse>("/jobs/replay", body, null as unknown as JobSubmitResponse),
    submitCalibration: (body: { period_name?: string } = {}) =>
      postApi<JobSubmitResponse>("/jobs/calibration", body, null as unknown as JobSubmitResponse),
    submitDataRefresh: () =>
      postApi<JobSubmitResponse>("/jobs/data-refresh", {}, null as unknown as JobSubmitResponse),
  },
  queue: {
    status: () =>
      fetchApi<QueueStatusResponse>("/system/queue", {
        redis_connected: false,
        queues: [],
        total_pending: 0,
        total_active: 0,
        total_failed: 0,
      }),
    workerHealth: () =>
      fetchApi<WorkerHealthResponse>("/system/worker-health", {
        redis_connected: false,
        workers: [],
        worker_count: 0,
      }),
    schedules: () =>
      fetchApi<ScheduleResponse>("/system/schedules", {
        schedules: [],
        scheduler_running: false,
      }),
  },
};
