-- ══════════════════════════════════════════════════════════════
-- Quant Service — Stage 4: simulation_results cache
-- ══════════════════════════════════════════════════════════════
-- Idempotent. Run after migration_quant_backtest.sql.
-- ══════════════════════════════════════════════════════════════


-- ┌──────────────────────────────────────────────────────────┐
-- │  simulation_results — cache keyed on StrategySpec hash    │
-- │  Mirrors pattern_stats_cache in posture.                   │
-- │  trade_log_sample URLs inside result.jsonb are patched    │
-- │  in place by the async charts job as each chart lands.    │
-- └──────────────────────────────────────────────────────────┘

create table if not exists simulation_results (
  hash             text        primary key,
  strategy_spec    jsonb       not null,
  result           jsonb       not null,
  computed_at      timestamptz not null default now(),
  ttl_days         int         not null default 30
);

create index if not exists idx_simulation_results_computed_at
  on simulation_results(computed_at desc);


-- ┌──────────────────────────────────────────────────────────┐
-- │  RLS — same posture as the other Stage tables.            │
-- │  Service role: full access. Authenticated: read-only.     │
-- │  anon: no access.                                          │
-- └──────────────────────────────────────────────────────────┘

alter table simulation_results enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'Service role full access simulation_results'
  ) then
    create policy "Service role full access simulation_results"
      on simulation_results for all to service_role
      using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'Authenticated read simulation_results'
  ) then
    create policy "Authenticated read simulation_results"
      on simulation_results for select to authenticated using (true);
  end if;
end $$;
