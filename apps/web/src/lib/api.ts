import type { AnalyzeResponse, RecentReportsResponse, DistressReport } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_PREFIX = "/api/v1";

async function fetchApi<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${API_PREFIX}${path}`, { cache: "no-store" });
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
  analyze: (ticker: string) =>
    postApi<AnalyzeResponse>("/analyze", { ticker }, {
      ticker: ticker.toUpperCase(),
      status: "error",
      report: null,
      message: "Unable to connect to the analysis service.",
    }),

  getReport: (ticker: string) =>
    fetchApi<DistressReport | null>(`/report/${ticker.toUpperCase()}`, null),

  recentReports: (limit = 20) =>
    fetchApi<RecentReportsResponse>(`/recent?limit=${limit}`, { reports: [], total: 0 }),

  validateTicker: (ticker: string) =>
    fetchApi<{ ticker: string; valid: boolean }>(`/validate/${ticker.toUpperCase()}`, {
      ticker: ticker.toUpperCase(),
      valid: false,
    }),
};
