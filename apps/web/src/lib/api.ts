import type {
  ActorStateResponse,
  AuthResponse,
  BookmarkListResponse,
  BookmarkOut,
  CalibrationRunListResponse,
  CompareResponse,
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
  SavedViewListResponse,
  SavedViewOut,
  ScenarioResponse,
  ScheduleResponse,
  SignalHistoryResponse,
  SignalSummary,
  SimulationRunResponse,
  SymbolHistoryResponse,
  SymbolOverview,
  SymbolReplayResponse,
  SymbolRunsResponse,
  SystemStatus,
  UserPreferences,
  UserProfile,
  WatchlistIntelligenceResponse,
  WatchlistListResponse,
  WatchlistOut,
  WorkerHealthResponse,
} from "./types";
import * as mock from "./mock-data";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_PREFIX = "/api/v1";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("sa_access_token");
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

async function fetchApi<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${API_PREFIX}${path}`, {
      cache: "no-store",
      headers: authHeaders(),
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
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

async function patchApi<T>(path: string, body: unknown, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${API_PREFIX}${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

async function deleteApi(path: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}${API_PREFIX}${path}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

export const api = {
  // ── Auth ─────────────────────────────────────────────────────────────────
  auth: {
    register: (body: { email: string; password: string; full_name: string }) =>
      postApi<AuthResponse>("/auth/register", body, null as unknown as AuthResponse),
    login: (body: { email: string; password: string }) =>
      postApi<AuthResponse>("/auth/login", body, null as unknown as AuthResponse),
    logout: (refresh_token: string) =>
      postApi<unknown>("/auth/logout", { refresh_token }, null),
    refresh: (refresh_token: string) =>
      postApi<{ access_token: string }>("/auth/refresh", { refresh_token }, null as unknown as { access_token: string }),
    me: () => fetchApi<UserProfile>("/auth/me", null as unknown as UserProfile),
  },

  // ── User data (authenticated) ───────────────────────────────────────────
  user: {
    preferences: () => fetchApi<UserPreferences>("/me/preferences", { default_symbol: "SPY", default_time_horizon: "1-3 days", preferred_signal_view: "compact", landing_page: "dashboard", default_view_id: null }),
    updatePreferences: (body: Partial<UserPreferences>) =>
      patchApi<UserPreferences>("/me/preferences", body, null as unknown as UserPreferences),
    bookmarks: () => fetchApi<BookmarkListResponse>("/me/bookmarks", { bookmarks: [], total: 0 }),
    createBookmark: (body: { symbol?: string; replay_date: string; label: string; note?: string }) =>
      postApi<BookmarkOut>("/me/bookmarks", body, null as unknown as BookmarkOut),
    deleteBookmark: (id: string) => deleteApi(`/me/bookmarks/${id}`),
  },
  watchlists: {
    list: () => fetchApi<WatchlistListResponse>("/watchlists", { watchlists: [], total: 0 }),
    create: (body: { name: string; description?: string }) =>
      postApi<WatchlistOut>("/watchlists", body, null as unknown as WatchlistOut),
    get: (id: string) => fetchApi<WatchlistOut>(`/watchlists/${id}`, null as unknown as WatchlistOut),
    update: (id: string, body: { name?: string; description?: string }) =>
      patchApi<WatchlistOut>(`/watchlists/${id}`, body, null as unknown as WatchlistOut),
    delete: (id: string) => deleteApi(`/watchlists/${id}`),
    addItem: (id: string, symbol: string) =>
      postApi<unknown>(`/watchlists/${id}/items`, { symbol }, null),
    removeItem: (watchlistId: string, itemId: string) =>
      deleteApi(`/watchlists/${watchlistId}/items/${itemId}`),
    intelligence: (id: string) =>
      fetchApi<WatchlistIntelligenceResponse>(`/watchlists/${id}/intelligence`, null as unknown as WatchlistIntelligenceResponse),
  },
  views: {
    list: () => fetchApi<SavedViewListResponse>("/views", { views: [], total: 0 }),
    create: (body: { name: string; view_type?: string; config?: Record<string, unknown>; is_default?: boolean }) =>
      postApi<SavedViewOut>("/views", body, null as unknown as SavedViewOut),
    get: (id: string) => fetchApi<SavedViewOut>(`/views/${id}`, null as unknown as SavedViewOut),
    update: (id: string, body: { name?: string; config?: Record<string, unknown>; is_default?: boolean }) =>
      patchApi<SavedViewOut>(`/views/${id}`, body, null as unknown as SavedViewOut),
    delete: (id: string) => deleteApi(`/views/${id}`),
  },

  // ── Symbol drilldown & compare (public) ──────────────────────────────────
  symbols: {
    overview: (symbol: string) =>
      fetchApi<SymbolOverview>(`/symbols/${symbol}/overview`, { symbol, regime: null, signal: null, actors: [], scenarios: [], dominant_actor: null, fragility: "unknown", warning_count: 0, last_simulation_at: null, run_id: null }),
    regime: (symbol: string) =>
      fetchApi<RegimeSnapshot>(`/symbols/${symbol}/regime`, null as unknown as RegimeSnapshot),
    actors: (symbol: string) =>
      fetchApi<ActorStateResponse>(`/symbols/${symbol}/actors`, { actors: [], actor_count: 0 }),
    scenarios: (symbol: string) =>
      fetchApi<ScenarioResponse>(`/symbols/${symbol}/scenarios`, { scenarios: [], base_case_id: "" }),
    signals: (symbol: string) =>
      fetchApi<SignalSummary>(`/symbols/${symbol}/signals`, null as unknown as SignalSummary),
    history: (symbol: string, limit = 30) =>
      fetchApi<SymbolHistoryResponse>(`/symbols/${symbol}/history?limit=${limit}`, { symbol, entries: [], total: 0 }),
    replay: (symbol: string, startDate?: string, endDate?: string) => {
      const params = new URLSearchParams();
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
      const qs = params.toString();
      return fetchApi<SymbolReplayResponse>(`/symbols/${symbol}/replay${qs ? `?${qs}` : ""}`, { symbol, frames: [], total: 0 });
    },
    runs: (symbol: string, limit = 20) =>
      fetchApi<SymbolRunsResponse>(`/symbols/${symbol}/runs?limit=${limit}`, { symbol, runs: [], total: 0 }),
  },
  compare: (symbols: string[]) =>
    fetchApi<CompareResponse>(`/symbols/compare?symbols=${symbols.join(",")}`, { symbols: [], compared_at: new Date().toISOString() }),

  // ── Shared simulation data (public) ─────────────────────────────────────
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
