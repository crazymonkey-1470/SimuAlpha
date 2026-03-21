// ── Regime ──────────────────────────────────────────────────────────────────

export interface RegimeDriver {
  factor: string;
  influence: number;
  description: string;
}

export interface RegimeSnapshot {
  regime: string;
  confidence: number;
  net_pressure: number;
  posture: string;
  risk_flags: string[];
  drivers: RegimeDriver[];
  summary: string;
  updated_at: string;
}

export interface RegimeHistoryEntry {
  date: string;
  regime: string;
  confidence: number;
  net_pressure: number;
  summary: string;
}

export interface RegimeHistoryResponse {
  entries: RegimeHistoryEntry[];
  period_start: string;
  period_end: string;
}

// ── Actors ─────────────────────────────────────────────────────────────────

export interface ActorSensitivity {
  factor: string;
  weight: number;
}

export interface ActorState {
  id: string;
  name: string;
  archetype: string;
  bias: string;
  conviction: number;
  contribution: number;
  horizon: string;
  sensitivities: ActorSensitivity[];
  recent_change: string;
  confidence: number;
}

export interface ActorStateResponse {
  actors: ActorState[];
  actor_count: number;
}

// ── Scenarios ──────────────────────────────────────────────────────────────

export interface ActorReaction {
  actor_archetype: string;
  expected_behavior: string;
}

export interface ScenarioBranch {
  id: string;
  name: string;
  probability: number;
  direction: string;
  drivers: string[];
  invalidation_conditions: string[];
  actor_reactions: ActorReaction[];
  risk_level: string;
  notes: string;
}

export interface ScenarioResponse {
  scenarios: ScenarioBranch[];
  base_case_id: string;
}

// ── Signals ────────────────────────────────────────────────────────────────

export interface SignalSummary {
  bias: string;
  confidence: number;
  time_horizon: string;
  suggested_posture: string;
  warnings: string[];
  change_vs_prior: string;
  updated_at: string;
}

export interface SignalHistoryEntry {
  date: string;
  bias: string;
  confidence: number;
  suggested_posture: string;
  summary: string;
}

export interface SignalHistoryResponse {
  entries: SignalHistoryEntry[];
  period_start: string;
  period_end: string;
}

// ── Replay ─────────────────────────────────────────────────────────────────

export interface ReplayFrame {
  date: string;
  regime: string;
  regime_confidence: number;
  net_pressure: number;
  actor_states: ActorState[];
  scenario_branches: ScenarioBranch[];
  realized_outcome: string | null;
  notes: string;
}

// ── System ─────────────────────────────────────────────────────────────────

export interface SystemStatus {
  api_status: string;
  data_freshness: string;
  last_simulation_run: string | null;
  calibration_status: string;
  worker_status: string;
  active_model_version: string;
  warnings: string[];
}

// ── Cross-Asset ────────────────────────────────────────────────────────────

export interface CrossAssetEntry {
  instrument: string;
  last_price: number;
  change_pct: number;
  volatility_state: string;
  trend_state: string;
  notes: string;
}

export interface CrossAssetResponse {
  entries: CrossAssetEntry[];
  as_of: string;
}

// ── Runs / Job Tracking ────────────────────────────────────────────────────

export interface RunSummary {
  id: string;
  run_type: string;
  symbol: string;
  status: string;
  source: string;
  summary: string | null;
  warnings: string[];
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface RunListResponse {
  runs: RunSummary[];
  total: number;
}

export interface ReplayRunSummary {
  id: string;
  symbol: string;
  start_date: string;
  end_date: string;
  status: string;
  summary: string | null;
  frame_count: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface ReplayRunListResponse {
  runs: ReplayRunSummary[];
  total: number;
}

export interface CalibrationRunSummary {
  id: string;
  symbol: string;
  period_name: string | null;
  start_date: string;
  end_date: string;
  status: string;
  summary: string | null;
  metrics: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
}

export interface CalibrationRunListResponse {
  runs: CalibrationRunSummary[];
  total: number;
}

// ── Simulation Run Response ────────────────────────────────────────────────

export interface SimulationRunResponse {
  run_id: string;
  status: string;
  submitted_at: string;
  message: string;
}

// ── Job Queue Types ───────────────────────────────────────────────────────

export interface JobSubmitResponse {
  job_id: string;
  job_type: string;
  status: string;
  enqueued_at: string;
  message: string;
}

export interface JobStatusResponse {
  id: string;
  job_type: string;
  status: string;
  symbol: string;
  source: string;
  summary: string | null;
  error_message: string | null;
  warnings: string[];
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
}

export interface JobListResponse {
  jobs: JobStatusResponse[];
  total: number;
}

export interface QueueInfo {
  name: string;
  pending: number;
  active: number;
  failed: number;
}

export interface QueueStatusResponse {
  redis_connected: boolean;
  queues: QueueInfo[];
  total_pending: number;
  total_active: number;
  total_failed: number;
}

export interface WorkerInfo {
  name: string;
  state: string;
  current_job: string | null;
  queues: string[];
  birth_date: string | null;
}

export interface WorkerHealthResponse {
  redis_connected: boolean;
  workers: WorkerInfo[];
  worker_count: number;
}

export interface ScheduleEntry {
  id: string;
  description: string;
  cron_string: string;
  queue_name: string;
}

export interface ScheduleResponse {
  schedules: ScheduleEntry[];
  scheduler_running: boolean;
}
