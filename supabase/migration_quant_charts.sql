-- ══════════════════════════════════════════════════════════════
-- Quant Service — Stage 2: TLI chart audit + Storage bucket policy
-- ══════════════════════════════════════════════════════════════
-- Idempotent. Run after migration_quant_data.sql.
-- ══════════════════════════════════════════════════════════════


-- ┌──────────────────────────────────────────────────────────┐
-- │  tli_charts_index — append-only-ish lookup by spec hash  │
-- │  Lets the backend / frontend find historical chart URLs   │
-- │  without re-rendering. Best-effort: render still succeeds │
-- │  even if this insert fails.                                │
-- └──────────────────────────────────────────────────────────┘

create table if not exists tli_charts_index (
  hash           text        primary key,
  ticker         text        not null,
  timeframe      text        not null check (timeframe in ('daily','weekly','monthly')),
  url            text        not null,
  width          int         not null,
  height         int         not null,
  request_spec   jsonb       not null,
  generated_at   timestamptz not null default now()
);

create index if not exists idx_tli_charts_index_ticker
  on tli_charts_index(ticker);
create index if not exists idx_tli_charts_index_ticker_tf
  on tli_charts_index(ticker, timeframe);
create index if not exists idx_tli_charts_index_generated_at
  on tli_charts_index(generated_at desc);


-- ┌──────────────────────────────────────────────────────────┐
-- │  RLS on tli_charts_index                                  │
-- │  Service role: full access (for the quant service)       │
-- │  Authenticated: read-only                                  │
-- │  anon: no access                                           │
-- └──────────────────────────────────────────────────────────┘

alter table tli_charts_index enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'Service role full access tli_charts_index'
  ) then
    create policy "Service role full access tli_charts_index"
      on tli_charts_index for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'Authenticated read tli_charts_index'
  ) then
    create policy "Authenticated read tli_charts_index"
      on tli_charts_index for select
      to authenticated
      using (true);
  end if;
end $$;


-- ┌──────────────────────────────────────────────────────────┐
-- │  Supabase Storage bucket: tli-charts                      │
-- │                                                            │
-- │  This service writes PNGs at:                              │
-- │    charts/{TICKER}/{timeframe}/{hash}.png                 │
-- │                                                            │
-- │  Bucket creation (one-time, in Supabase Dashboard or via   │
-- │  the supabase CLI):                                        │
-- │                                                            │
-- │    insert into storage.buckets (id, name, public)         │
-- │    values ('tli-charts', 'tli-charts', true)              │
-- │    on conflict (id) do nothing;                            │
-- │                                                            │
-- │  Public-read so URLs are loadable without signing.         │
-- │  RLS below blocks anonymous writes; only the service       │
-- │  role can insert / update / delete chart objects.          │
-- └──────────────────────────────────────────────────────────┘

insert into storage.buckets (id, name, public)
values ('tli-charts', 'tli-charts', true)
on conflict (id) do update set public = excluded.public;

-- Storage policies (storage.objects). Apply only to the tli-charts bucket.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'tli-charts public read'
  ) then
    create policy "tli-charts public read"
      on storage.objects for select
      using (bucket_id = 'tli-charts');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'tli-charts service write'
  ) then
    create policy "tli-charts service write"
      on storage.objects for all
      to service_role
      using (bucket_id = 'tli-charts')
      with check (bucket_id = 'tli-charts');
  end if;
end $$;
