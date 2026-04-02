-- The Long Screener — Full Supabase Schema
-- Paste and run in the Supabase SQL Editor

-- Full market universe (Stage 1 output)
create table if not exists universe (
  id uuid default gen_random_uuid() primary key,
  ticker text not null unique,
  company_name text,
  exchange text,
  sector text,
  industry text,
  market_cap numeric,
  last_updated timestamptz default now()
);

-- Pre-screened candidates (Stage 2 output)
create table if not exists screener_candidates (
  id uuid default gen_random_uuid() primary key,
  ticker text not null unique,
  company_name text,
  sector text,
  market_cap numeric,
  current_price numeric,
  revenue_growth_pct numeric,
  pct_from_52w_high numeric,
  prescreen_score integer,
  last_updated timestamptz default now()
);

-- Full TLI scored results (Stage 3 output)
create table if not exists screener_results (
  id uuid default gen_random_uuid() primary key,
  ticker text not null unique,
  company_name text,
  sector text,
  current_price numeric,
  price_200wma numeric,
  price_200mma numeric,
  pct_from_200wma numeric,
  pct_from_200mma numeric,
  revenue_current numeric,
  revenue_prior_year numeric,
  revenue_growth_pct numeric,
  pe_ratio numeric,
  ps_ratio numeric,
  week_52_high numeric,
  pct_from_52w_high numeric,
  fundamental_score integer,
  technical_score integer,
  total_score integer,
  previous_score integer,
  signal text,
  previous_signal text,
  entry_zone boolean,
  entry_note text,
  last_updated timestamptz default now()
);

-- Signal change history (fires Telegram alerts)
create table if not exists signal_alerts (
  id uuid default gen_random_uuid() primary key,
  ticker text not null,
  company_name text,
  alert_type text,
  previous_signal text,
  new_signal text,
  score integer,
  current_price numeric,
  price_200wma numeric,
  price_200mma numeric,
  entry_note text,
  fired_at timestamptz default now()
);

-- Watchlist
create table if not exists watchlist (
  id uuid default gen_random_uuid() primary key,
  ticker text not null unique,
  added_at timestamptz default now(),
  notes text
);

-- Scan history log
create table if not exists scan_history (
  id uuid default gen_random_uuid() primary key,
  stage text,
  tickers_processed integer,
  tickers_passed integer,
  load_the_boat_count integer,
  accumulate_count integer,
  alerts_fired integer,
  top_opportunities jsonb,
  scanned_at timestamptz default now()
);

-- Enable RLS on all tables
alter table universe enable row level security;
alter table screener_candidates enable row level security;
alter table screener_results enable row level security;
alter table signal_alerts enable row level security;
alter table watchlist enable row level security;
alter table scan_history enable row level security;

-- Public read policies (frontend reads via anon key)
create policy "Public read universe" on universe for select using (true);
create policy "Public read candidates" on screener_candidates for select using (true);
create policy "Public read screener_results" on screener_results for select using (true);
create policy "Public read signal_alerts" on signal_alerts for select using (true);
create policy "Public read scan_history" on scan_history for select using (true);

-- Watchlist: public read, insert, update, delete
create policy "Public read watchlist" on watchlist for select using (true);
create policy "Public insert watchlist" on watchlist for insert with check (true);
create policy "Public update watchlist" on watchlist for update using (true);
create policy "Public delete watchlist" on watchlist for delete using (true);

-- Performance indexes
create index if not exists idx_screener_score on screener_results(total_score desc);
create index if not exists idx_screener_signal on screener_results(signal);
create index if not exists idx_screener_entry on screener_results(entry_zone) where entry_zone = true;
create index if not exists idx_alerts_fired on signal_alerts(fired_at desc);
create index if not exists idx_alerts_ticker on signal_alerts(ticker);
create index if not exists idx_scan_history_time on scan_history(scanned_at desc);

-- ══════════════════════════════════════════════════════
-- Stage 4: Elliott Wave + Backtesting Tables
-- ══════════════════════════════════════════════════════

-- Wave count results (Stage 4 output)
create table if not exists wave_counts (
  id uuid default gen_random_uuid() primary key,
  ticker text not null,
  timeframe text not null,            -- 'monthly' | 'weekly'
  wave_degree text not null,          -- 'primary' | 'intermediate'
  wave_structure text,                -- 'impulse' | 'corrective'
  current_wave text,                  -- '1','2','3','4','5','A','B','C'
  confidence_score integer,           -- 0-100
  confidence_label text,              -- 'HIGH','PROBABLE','SPECULATIVE'
  tli_signal text,                    -- 'BUY_ZONE','ACCUMULATE_ZONE','AVOID','NEUTRAL'
  tli_reason text,
  pivot_count integer,
  entry_zone numeric,
  stop_loss numeric,
  target_1 numeric,
  target_2 numeric,
  reward_risk_ratio numeric,
  last_updated timestamptz default now(),
  unique(ticker, timeframe, wave_degree)
);

-- Historical backtest individual signals
create table if not exists backtest_results (
  id uuid default gen_random_uuid() primary key,
  ticker text not null,
  timeframe text,
  wave_degree text,
  signal_date text,
  signal_wave text,
  entry_price numeric,
  stop_loss numeric,
  target_1 numeric,
  target_2 numeric,
  outcome text,                       -- 'TARGET_1_HIT','TARGET_2_HIT','STOPPED_OUT','OPEN'
  exit_price numeric,
  exit_date text,
  hold_days integer,
  pct_return numeric,
  max_drawdown_pct numeric,
  max_gain_pct numeric
);

-- Backtest summary per ticker
create table if not exists backtest_summary (
  id uuid default gen_random_uuid() primary key,
  ticker text not null unique,
  total_signals integer,
  winning_signals integer,
  win_rate_pct numeric,
  avg_return_pct numeric,
  avg_hold_days integer,
  avg_reward_risk numeric,
  best_return_pct numeric,
  worst_return_pct numeric,
  total_return_pct numeric,
  vs_spy_pct numeric,
  last_updated timestamptz default now()
);

-- Enable RLS
alter table wave_counts enable row level security;
alter table backtest_results enable row level security;
alter table backtest_summary enable row level security;

-- Public read policies
create policy "Public read wave_counts" on wave_counts for select using (true);
create policy "Public read backtest_results" on backtest_results for select using (true);
create policy "Public read backtest_summary" on backtest_summary for select using (true);

-- Performance indexes
create index if not exists idx_wave_ticker on wave_counts(ticker);
create index if not exists idx_wave_signal on wave_counts(tli_signal);
create index if not exists idx_backtest_ticker on backtest_results(ticker);
create index if not exists idx_backtest_outcome on backtest_results(outcome);
create index if not exists idx_bt_summary_ticker on backtest_summary(ticker);
create index if not exists idx_bt_summary_winrate on backtest_summary(win_rate_pct desc);

-- ══════════════════════════════════════════════════════
-- Phase 3: Claude AI Interpretation Columns
-- ══════════════════════════════════════════════════════

-- Add Claude interpretation to wave_counts
alter table wave_counts
add column if not exists claude_interpretation jsonb,
add column if not exists claude_model text,
add column if not exists claude_interpreted_at timestamptz;

-- Add Claude narrative to signal_alerts
alter table signal_alerts
add column if not exists claude_narrative text,
add column if not exists claude_conviction text;

-- Index for finding stale interpretations
create index if not exists idx_wave_counts_interpreted_at
on wave_counts(claude_interpreted_at);
