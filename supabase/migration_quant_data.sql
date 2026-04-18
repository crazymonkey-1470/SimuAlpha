-- ══════════════════════════════════════════════════════════════
-- Quant Research Service — Data ingestion tables
-- ══════════════════════════════════════════════════════════════
-- Owned by the Python quant/ service. OpenBB pulls populate these.
-- Safe to re-run: uses IF NOT EXISTS / IF EXISTS throughout.
-- ══════════════════════════════════════════════════════════════


-- ┌──────────────────────────────────────────────────────────┐
-- │  prices_daily — daily OHLCV per ticker                   │
-- └──────────────────────────────────────────────────────────┘

create table if not exists prices_daily (
  ticker        text        not null,
  date          date        not null,
  open          numeric,
  high          numeric,
  low           numeric,
  close         numeric,
  adj_close     numeric,
  volume        bigint,
  source        text,
  ingested_at   timestamptz not null default now(),
  primary key (ticker, date)
);

create index if not exists idx_prices_daily_ticker on prices_daily(ticker);
create index if not exists idx_prices_daily_date   on prices_daily(date);


-- ┌──────────────────────────────────────────────────────────┐
-- │  fundamentals_quarterly — long-format quarterly metrics  │
-- └──────────────────────────────────────────────────────────┘

create table if not exists fundamentals_quarterly (
  ticker        text        not null,
  period_end    date        not null,
  metric_name   text        not null,
  metric_value  numeric,
  source        text,
  ingested_at   timestamptz not null default now(),
  primary key (ticker, period_end, metric_name)
);

create index if not exists idx_fundamentals_quarterly_ticker
  on fundamentals_quarterly(ticker);
create index if not exists idx_fundamentals_quarterly_ticker_metric
  on fundamentals_quarterly(ticker, metric_name);


-- ┌──────────────────────────────────────────────────────────┐
-- │  Row-level security                                       │
-- │  Service role: full access (bypasses RLS automatically;  │
-- │  explicit policy added for clarity).                      │
-- │  Authenticated: read-only.                                │
-- │  anon: no access.                                          │
-- └──────────────────────────────────────────────────────────┘

alter table prices_daily enable row level security;
alter table fundamentals_quarterly enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'Service role full access prices_daily'
  ) then
    create policy "Service role full access prices_daily"
      on prices_daily for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'Authenticated read prices_daily'
  ) then
    create policy "Authenticated read prices_daily"
      on prices_daily for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'Service role full access fundamentals_quarterly'
  ) then
    create policy "Service role full access fundamentals_quarterly"
      on fundamentals_quarterly for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'Authenticated read fundamentals_quarterly'
  ) then
    create policy "Authenticated read fundamentals_quarterly"
      on fundamentals_quarterly for select
      to authenticated
      using (true);
  end if;
end $$;
