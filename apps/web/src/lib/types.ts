export interface DistressReport {
  id: string;
  ticker: string;
  company_name: string;
  sector: string | null;
  industry: string | null;
  distress_rating: string;
  distress_score: number;
  executive_summary: string;
  why_safe: string[];
  key_risks: string[];
  stabilizing_factors: string[];
  what_to_watch: string[];
  liquidity_analysis: string | null;
  leverage_analysis: string | null;
  profitability_analysis: string | null;
  cashflow_analysis: string | null;
  interest_coverage_analysis: string | null;
  dilution_risk_analysis: string | null;
  long_term_trend_analysis: string | null;
  hold_context: string | null;
  analyst_notes: string | null;
  source_period_end: string | null;
  raw_metrics: Record<string, number | string | boolean> | null;
  report_version: string;
  status: string;
  generated_at: string;
  updated_at: string;
}

export interface ReportSummary {
  id: string;
  ticker: string;
  company_name: string;
  sector: string | null;
  distress_rating: string;
  distress_score: number;
  executive_summary: string;
  generated_at: string;
}

export interface AnalyzeResponse {
  ticker: string;
  status: string;
  report: DistressReport | null;
  message: string | null;
}

export interface RecentReportsResponse {
  reports: ReportSummary[];
  total: number;
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  default_workspace_id: string | null;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserProfile;
}
