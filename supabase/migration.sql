-- The Long Screener — Supabase Schema Migration
-- Run this in the Supabase SQL Editor

-- Screener results cache
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
  fundamental_score integer,
  technical_score integer,
  total_score integer,
  signal text, -- 'LOAD THE BOAT', 'ACCUMULATE', 'WATCH'
  week_52_high numeric,
  pct_from_52w_high numeric,
  last_updated timestamptz default now()
);

-- Index for fast lookups and sorting
create index if not exists idx_screener_ticker on screener_results(ticker);
create index if not exists idx_screener_score on screener_results(total_score desc);
create index if not exists idx_screener_signal on screener_results(signal);

-- Watchlist
create table if not exists watchlist (
  id uuid default gen_random_uuid() primary key,
  ticker text not null unique,
  added_at timestamptz default now(),
  notes text
);

-- Scan history
create table if not exists scan_history (
  id uuid default gen_random_uuid() primary key,
  tickers_scanned integer,
  top_opportunities jsonb,
  scanned_at timestamptz default now()
);

-- Enable Row Level Security (optional, for public access during development)
alter table screener_results enable row level security;
alter table watchlist enable row level security;
alter table scan_history enable row level security;

-- Allow anonymous read/write for development (tighten for production)
create policy "Allow anonymous access to screener_results"
  on screener_results for all
  using (true) with check (true);

create policy "Allow anonymous access to watchlist"
  on watchlist for all
  using (true) with check (true);

create policy "Allow anonymous access to scan_history"
  on scan_history for all
  using (true) with check (true);
