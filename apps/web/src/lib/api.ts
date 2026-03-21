import type {
  ActorStateResponse,
  CalibrationRunListResponse,
  CrossAssetResponse,
  RegimeHistoryResponse,
  RegimeSnapshot,
  ReplayFrame,
  ReplayRunListResponse,
  RunListResponse,
  RunSummary,
  ScenarioResponse,
  SignalHistoryResponse,
  SignalSummary,
  SimulationRunResponse,
  SystemStatus,
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
};
