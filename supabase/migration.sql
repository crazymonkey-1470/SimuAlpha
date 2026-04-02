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
