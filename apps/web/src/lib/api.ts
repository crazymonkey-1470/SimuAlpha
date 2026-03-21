import type {
  ActorStateResponse,
  CrossAssetResponse,
  RegimeHistoryResponse,
  RegimeSnapshot,
  ReplayFrame,
  ScenarioResponse,
  SignalHistoryResponse,
  SignalSummary,
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
    // Fallback to mock data when backend is unavailable
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
};
