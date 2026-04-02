-- The Long Screener — Supabase Schema
-- Run these SQL statements in the Supabase SQL Editor

-- Screener results (Railway writes, frontend reads)
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
  signal text,
  last_updated timestamptz default now()
);

-- Watchlist (frontend reads and writes)
create table if not exists watchlist (
  id uuid default gen_random_uuid() primary key,
  ticker text not null unique,
  added_at timestamptz default now(),
  notes text
);

-- Scan history log
create table if not exists scan_history (
  id uuid default gen_random_uuid() primary key,
  tickers_scanned integer,
  load_the_boat_count integer,
  accumulate_count integer,
  top_opportunities jsonb,
  scanned_at timestamptz default now()
);

-- Enable RLS
alter table screener_results enable row level security;
alter table watchlist enable row level security;
alter table scan_history enable row level security;

-- Public read on screener_results and scan_history
create policy "Public read screener_results"
  on screener_results for select using (true);

create policy "Public read scan_history"
  on scan_history for select using (true);

-- Public read and write on watchlist (no auth needed for MVP)
create policy "Public read watchlist"
  on watchlist for select using (true);

create policy "Public insert watchlist"
  on watchlist for insert with check (true);

create policy "Public delete watchlist"
  on watchlist for delete using (true);

create policy "Public update watchlist"
  on watchlist for update using (true);

-- Indexes for performance
create index if not exists idx_screener_score on screener_results(total_score desc);
create index if not exists idx_screener_signal on screener_results(signal);
