-- ══════════════════════════════════════════════════════════════
-- Quant Service — Stage 3: backtest cache, signal audit, async jobs
-- ══════════════════════════════════════════════════════════════
-- Idempotent. Run after migration_quant_data.sql + migration_quant_charts.sql.
-- ══════════════════════════════════════════════════════════════


-- ┌──────────────────────────────────────────────────────────┐
-- │  pattern_stats_cache — request-hash → result jsonb        │
-- │  Lookup the agent path uses to skip re-running identical  │
-- │  backtests. ttl_days bounds freshness.                     │
-- └──────────────────────────────────────────────────────────┘

create table if not exists pattern_stats_cache (
  hash             text        primary key,
  pattern_name     text,
  request_payload  jsonb       not null,
  result           jsonb       not null,
  computed_at      timestamptz not null default now(),
  ttl_days         int         not null default 30
);

create index if not exists idx_pattern_stats_cache_pattern
  on pattern_stats_cache(pattern_name);
create index if not exists idx_pattern_stats_cache_computed_at
  on pattern_stats_cache(computed_at desc);


-- ┌──────────────────────────────────────────────────────────┐
-- │  pattern_signals — append-only audit of detected signals  │
-- │  Every (pattern_name, ticker, signal_date) the engine     │
-- │  surfaces lands here so we can re-aggregate or audit.     │
-- └──────────────────────────────────────────────────────────┘

create table if not exists pattern_signals (
  pattern_name      text        not null,
  ticker            text        not null,
  signal_date       date        not null,
  params            jsonb,
  forward_returns   jsonb,
  computed_at       timestamptz not null default now(),
  primary key (pattern_name, ticker, signal_date)
);

create index if not exists idx_pattern_signals_ticker
  on pattern_signals(ticker);
create index if not exists idx_pattern_signals_pattern_date
  on pattern_signals(pattern_name, signal_date desc);


-- ┌──────────────────────────────────────────────────────────┐
-- │  backtest_jobs — async job tracking                        │
-- │  Mirror of the in-process registry; persisted so the       │
-- │  admin UI / audit log can see queued / completed jobs.    │
-- └──────────────────────────────────────────────────────────┘

create table if not exists backtest_jobs (
  job_id           text        primary key,
  status           text        not null check (status in ('queued','running','done','error')),
  request_payload  jsonb,
  error            text,
  submitted_at     timestamptz not null default now(),
  started_at       timestamptz,
  completed_at     timestamptz
);

create index if not exists idx_backtest_jobs_status
  on backtest_jobs(status);
create index if not exists idx_backtest_jobs_submitted_at
  on backtest_jobs(submitted_at desc);


-- ┌──────────────────────────────────────────────────────────┐
-- │  RLS — same posture as prices_daily / fundamentals_quarterly │
-- │  Service role: full access. Authenticated: read-only.     │
-- │  anon: no access.                                          │
-- └──────────────────────────────────────────────────────────┘

alter table pattern_stats_cache enable row level security;
alter table pattern_signals     enable row level security;
alter table backtest_jobs       enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'Service role full access pattern_stats_cache'
  ) then
    create policy "Service role full access pattern_stats_cache"
      on pattern_stats_cache for all to service_role
      using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'Authenticated read pattern_stats_cache'
  ) then
    create policy "Authenticated read pattern_stats_cache"
      on pattern_stats_cache for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'Service role full access pattern_signals'
  ) then
    create policy "Service role full access pattern_signals"
      on pattern_signals for all to service_role
      using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'Authenticated read pattern_signals'
  ) then
    create policy "Authenticated read pattern_signals"
      on pattern_signals for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'Service role full access backtest_jobs'
  ) then
    create policy "Service role full access backtest_jobs"
      on backtest_jobs for all to service_role
      using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'Authenticated read backtest_jobs'
  ) then
    create policy "Authenticated read backtest_jobs"
      on backtest_jobs for select to authenticated using (true);
  end if;
end $$;
