-- ══════════════════════════════════════════════════════════════
-- The Long Screener — Complete Supabase Schema
-- ══════════════════════════════════════════════════════════════
-- Run this ONCE in the Supabase SQL Editor.
-- Safe to re-run: uses IF NOT EXISTS / IF EXISTS throughout.
-- Drop all tables first if you want a clean slate:
--   drop table if exists watchlist, backtest_results, backtest_summary,
--     wave_counts, signal_alerts, scan_history, screener_results,
--     screener_candidates, universe cascade;
-- ══════════════════════════════════════════════════════════════


-- ┌──────────────────────────────────────────────────────────┐
-- │  TABLE 1: universe (Stage 1 output)                      │
-- │  Full market universe — NYSE + NASDAQ investable stocks   │
-- └──────────────────────────────────────────────────────────┘

create table if not exists universe (
  id            uuid        default gen_random_uuid() primary key,
  ticker        text        not null unique,
  company_name  text,
  exchange      text,                 -- 'NYSE' | 'NASDAQ'
  sector        text,
  industry      text,
  market_cap    numeric,
  last_updated  timestamptz default now()
);


-- ┌──────────────────────────────────────────────────────────┐
-- │  TABLE 2: screener_candidates (Stage 2 output)           │
-- │  Pre-screened universe survivors (~200-400 tickers)       │
-- └──────────────────────────────────────────────────────────┘

create table if not exists screener_candidates (
  id                  uuid        default gen_random_uuid() primary key,
  ticker              text        not null unique,
  company_name        text,
  sector              text,
  market_cap          numeric,
  current_price       numeric,
  revenue_growth_pct  numeric,              -- rounded to 1 decimal, nullable
  pct_from_52w_high   numeric,              -- rounded to 1 decimal, nullable
  prescreen_score     integer     default 0,
  last_updated        timestamptz default now()
);


-- ┌──────────────────────────────────────────────────────────┐
-- │  TABLE 3: screener_results (Stage 3 output)              │
-- │  Deep-scored stocks with TLI signal + fundamentals        │
-- └──────────────────────────────────────────────────────────┘

create table if not exists screener_results (
  id                  uuid        default gen_random_uuid() primary key,
  ticker              text        not null unique,
  company_name        text,
  sector              text,
  current_price       numeric,
  price_200wma        numeric,
  price_200mma        numeric,
  pct_from_200wma     numeric,
  pct_from_200mma     numeric,
  revenue_current     numeric,
  revenue_prior_year  numeric,
  revenue_growth_pct  numeric,
  pe_ratio            numeric,
  ps_ratio            numeric,
  week_52_high        numeric,
  pct_from_52w_high   numeric,
  fundamental_score   integer,              -- 0-50
  technical_score     integer,              -- 0-50
  total_score         integer,              -- 0-100
  previous_score      integer,
  signal              text,                 -- 'PASS' | 'WATCH' | 'ACCUMULATE' | 'LOAD THE BOAT'
  previous_signal     text,
  entry_zone          boolean,
  entry_note          text,
  last_updated        timestamptz default now()
);


-- ┌──────────────────────────────────────────────────────────┐
-- │  TABLE 4: signal_alerts                                   │
-- │  Alert log — signal changes + wave buy zones              │
-- └──────────────────────────────────────────────────────────┘

create table if not exists signal_alerts (
  id                uuid        default gen_random_uuid() primary key,
  ticker            text        not null,
  company_name      text,
  alert_type        text,                   -- 'LOAD_THE_BOAT' | 'SIGNAL_UPGRADE' | 'CROSSED_200WMA' | 'CROSSED_200MMA' | 'WAVE_BUY_ZONE'
  previous_signal   text,
  new_signal        text,
  score             integer,
  current_price     numeric,
  price_200wma      numeric,
  price_200mma      numeric,
  entry_note        text,
  claude_narrative   text,                  -- AI-generated alert narrative
  claude_conviction  text,                  -- 'HIGH' | 'MEDIUM' | 'LOW'
  fired_at          timestamptz default now()
);


-- ┌──────────────────────────────────────────────────────────┐
-- │  TABLE 5: wave_counts (Stage 4 output)                   │
-- │  Elliott Wave analysis per ticker/timeframe/degree        │
-- └──────────────────────────────────────────────────────────┘

create table if not exists wave_counts (
  id                    uuid        default gen_random_uuid() primary key,
  ticker                text        not null,
  timeframe             text        not null,     -- 'monthly' | 'weekly'
  wave_degree           text        not null,     -- 'primary' | 'intermediate'
  wave_structure        text,                     -- 'impulse' | 'corrective'
  current_wave          text,                     -- '1','2','3','4','5','A','B','C','POST-5','POST-C','?'
  confidence_score      integer,                  -- 0-100
  confidence_label      text,                     -- 'HIGH CONFIDENCE' | 'PROBABLE' | 'SPECULATIVE' | 'INVALID'
  tli_signal            text,                     -- 'BUY_ZONE' | 'WATCH' | 'AVOID'
  tli_signal_reason     text,
  wave_count_json       jsonb,                    -- array of pivot objects
  entry_zone_low        numeric,
  entry_zone_high       numeric,
  stop_loss             numeric,
  target_1              numeric,
  target_2              numeric,
  target_3              numeric,
  reward_risk_ratio     numeric,
  claude_interpretation jsonb,                    -- structured AI analysis
  claude_model          text,                     -- e.g. 'claude-haiku-4-5-20251001'
  claude_interpreted_at timestamptz,
  last_updated          timestamptz default now(),
  unique(ticker, timeframe, wave_degree)
);


-- ┌──────────────────────────────────────────────────────────┐
-- │  TABLE 6: backtest_results                                │
-- │  Individual historical backtest signals (trades)          │
-- └──────────────────────────────────────────────────────────┘

create table if not exists backtest_results (
  id                uuid        default gen_random_uuid() primary key,
  ticker            text        not null,
  timeframe         text,                   -- 'monthly'
  wave_degree       text,                   -- 'primary'
  signal_date       text,                   -- ISO date string
  signal_wave       text,                   -- wave label
  entry_price       numeric,
  stop_loss         numeric,
  target_1          numeric,
  target_2          numeric,
  outcome           text,                   -- 'TARGET_1_HIT' | 'TARGET_2_HIT' | 'STOPPED_OUT' | 'OPEN'
  exit_price        numeric,
  exit_date         text,
  hold_days         integer,
  pct_return        numeric,
  max_drawdown_pct  numeric,
  max_gain_pct      numeric
);


-- ┌──────────────────────────────────────────────────────────┐
-- │  TABLE 7: backtest_summary                                │
-- │  Aggregated backtest performance per ticker               │
-- └──────────────────────────────────────────────────────────┘

create table if not exists backtest_summary (
  id                uuid        default gen_random_uuid() primary key,
  ticker            text        not null unique,
  total_signals     integer,
  winning_signals   integer,
  win_rate_pct      numeric,
  avg_return_pct    numeric,
  avg_hold_days     integer,
  avg_reward_risk   numeric,
  best_return_pct   numeric,
  worst_return_pct  numeric,
  total_return_pct  numeric,
  vs_spy_pct        numeric,
  last_updated      timestamptz default now()
);


-- ┌──────────────────────────────────────────────────────────┐
-- │  TABLE 8: watchlist                                       │
-- │  User's personal ticker watchlist                         │
-- └──────────────────────────────────────────────────────────┘

create table if not exists watchlist (
  id        uuid        default gen_random_uuid() primary key,
  ticker    text        not null unique,
  added_at  timestamptz default now(),
  notes     text
);


-- ┌──────────────────────────────────────────────────────────┐
-- │  TABLE 9: scan_history                                    │
-- │  Pipeline run logs with summary stats                     │
-- └──────────────────────────────────────────────────────────┘

create table if not exists scan_history (
  id                  uuid        default gen_random_uuid() primary key,
  stage               text,                 -- 'UNIVERSE' | 'PRESCREEN' | 'DEEPSCORE' | 'WAVECOUNT'
  tickers_processed   integer,
  tickers_passed      integer,
  load_the_boat_count integer,              -- Stage 3 only
  accumulate_count    integer,              -- Stage 3 only
  alerts_fired        integer,              -- Stage 3 + 4
  top_opportunities   jsonb,                -- Stage 3 only: [{ ticker, score, signal, entry_zone }]
  scanned_at          timestamptz default now()
);


-- ══════════════════════════════════════════════════════════════
-- FOREIGN KEYS
-- ══════════════════════════════════════════════════════════════

-- Required for Supabase nested select: .select('*, screener_results(*)')
-- Only add if not already present
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'fk_watchlist_ticker'
  ) then
    alter table watchlist
      add constraint fk_watchlist_ticker
      foreign key (ticker) references screener_results(ticker)
      on delete cascade;
  end if;
end $$;


-- ══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════

-- Enable RLS on all tables
alter table universe enable row level security;
alter table screener_candidates enable row level security;
alter table screener_results enable row level security;
alter table signal_alerts enable row level security;
alter table wave_counts enable row level security;
alter table backtest_results enable row level security;
alter table backtest_summary enable row level security;
alter table watchlist enable row level security;
alter table scan_history enable row level security;

-- Public read policies (frontend reads via anon key)
-- Backend uses service_role key which bypasses RLS entirely
do $$
begin
  -- universe
  if not exists (select 1 from pg_policies where policyname = 'Public read universe') then
    create policy "Public read universe" on universe for select using (true);
  end if;

  -- screener_candidates
  if not exists (select 1 from pg_policies where policyname = 'Public read candidates') then
    create policy "Public read candidates" on screener_candidates for select using (true);
  end if;

  -- screener_results
  if not exists (select 1 from pg_policies where policyname = 'Public read screener_results') then
    create policy "Public read screener_results" on screener_results for select using (true);
  end if;

  -- signal_alerts
  if not exists (select 1 from pg_policies where policyname = 'Public read signal_alerts') then
    create policy "Public read signal_alerts" on signal_alerts for select using (true);
  end if;

  -- wave_counts
  if not exists (select 1 from pg_policies where policyname = 'Public read wave_counts') then
    create policy "Public read wave_counts" on wave_counts for select using (true);
  end if;

  -- backtest_results
  if not exists (select 1 from pg_policies where policyname = 'Public read backtest_results') then
    create policy "Public read backtest_results" on backtest_results for select using (true);
  end if;

  -- backtest_summary
  if not exists (select 1 from pg_policies where policyname = 'Public read backtest_summary') then
    create policy "Public read backtest_summary" on backtest_summary for select using (true);
  end if;

  -- scan_history
  if not exists (select 1 from pg_policies where policyname = 'Public read scan_history') then
    create policy "Public read scan_history" on scan_history for select using (true);
  end if;

  -- watchlist: full CRUD (frontend manages this directly via anon key)
  if not exists (select 1 from pg_policies where policyname = 'Public read watchlist') then
    create policy "Public read watchlist" on watchlist for select using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Public insert watchlist') then
    create policy "Public insert watchlist" on watchlist for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Public update watchlist') then
    create policy "Public update watchlist" on watchlist for update using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Public delete watchlist') then
    create policy "Public delete watchlist" on watchlist for delete using (true);
  end if;
end $$;


-- ══════════════════════════════════════════════════════════════
-- PERFORMANCE INDEXES
-- ══════════════════════════════════════════════════════════════

-- screener_results (most queried table)
create index if not exists idx_screener_score    on screener_results(total_score desc);
create index if not exists idx_screener_signal   on screener_results(signal);
create index if not exists idx_screener_ticker   on screener_results(ticker);
create index if not exists idx_screener_entry    on screener_results(entry_zone) where entry_zone = true;

-- signal_alerts
create index if not exists idx_alerts_fired      on signal_alerts(fired_at desc);
create index if not exists idx_alerts_ticker     on signal_alerts(ticker);
create index if not exists idx_alerts_ticker_fired on signal_alerts(ticker, fired_at desc);

-- wave_counts
create index if not exists idx_wave_ticker       on wave_counts(ticker);
create index if not exists idx_wave_signal       on wave_counts(tli_signal);
create index if not exists idx_wave_confidence   on wave_counts(confidence_score desc);
create index if not exists idx_wave_interpreted  on wave_counts(claude_interpreted_at);

-- backtest
create index if not exists idx_backtest_ticker   on backtest_results(ticker);
create index if not exists idx_backtest_outcome  on backtest_results(outcome);
create index if not exists idx_bt_summary_ticker on backtest_summary(ticker);
create index if not exists idx_bt_summary_winrate on backtest_summary(win_rate_pct desc);

-- scan_history
create index if not exists idx_scan_history_time on scan_history(scanned_at desc);

-- watchlist
create index if not exists idx_watchlist_ticker  on watchlist(ticker);


-- ┌──────────────────────────────────────────────────────────┐
-- │  TABLE: custom_alerts                                     │
-- │  User-configured alert thresholds per ticker              │
-- └──────────────────────────────────────────────────────────┘

create table if not exists custom_alerts (
  id          uuid        default gen_random_uuid() primary key,
  ticker      text        not null,
  metric      text        not null,        -- 'total_score', 'pct_from_200wma', 'current_price', 'signal'
  condition   text        not null,        -- 'above', 'below', 'equals'
  threshold   text        not null,        -- numeric string or signal name
  telegram    boolean     default false,   -- send Telegram notification
  active      boolean     default true,
  last_fired  timestamptz,
  created_at  timestamptz default now()
);

alter table custom_alerts enable row level security;
create policy "Public read custom_alerts"   on custom_alerts for select using (true);
create policy "Public insert custom_alerts" on custom_alerts for insert with check (true);
create policy "Public update custom_alerts" on custom_alerts for update using (true);
create policy "Public delete custom_alerts" on custom_alerts for delete using (true);

create index if not exists idx_custom_alerts_ticker on custom_alerts(ticker);
create index if not exists idx_custom_alerts_active on custom_alerts(active) where active = true;


-- ┌──────────────────────────────────────────────────────────┐
-- │  TABLE: portfolio_positions                                │
-- │  User portfolio positions with entry/exit tracking         │
-- └──────────────────────────────────────────────────────────┘

create table if not exists portfolio_positions (
  id              uuid        default gen_random_uuid() primary key,
  ticker          text        not null,
  entry_price     decimal     not null,
  shares          decimal     not null,
  entry_date      date        not null,
  tranche_number  int         default 1,
  wave_at_entry   text,
  score_at_entry  int,
  signal_at_entry text,
  notes           text,
  status          text        default 'OPEN',
  exit_price      decimal,
  exit_date       date,
  exit_reason     text,
  created_at      timestamptz default now()
);

create table if not exists portfolio_transactions (
  id              uuid        default gen_random_uuid() primary key,
  position_id     uuid        references portfolio_positions(id),
  ticker          text        not null,
  action          text        not null,
  shares          decimal     not null,
  price           decimal     not null,
  tranche_number  int,
  date            date        not null,
  notes           text,
  created_at      timestamptz default now()
);

create index if not exists idx_portfolio_ticker on portfolio_positions(ticker);
create index if not exists idx_portfolio_status on portfolio_positions(status);
create index if not exists idx_transactions_ticker on portfolio_transactions(ticker);

alter table portfolio_positions enable row level security;
alter table portfolio_transactions enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Public rw portfolio_positions') then
    create policy "Public rw portfolio_positions" on portfolio_positions for all using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Public rw portfolio_transactions') then
    create policy "Public rw portfolio_transactions" on portfolio_transactions for all using (true);
  end if;
end $$;


-- ┌──────────────────────────────────────────────────────────┐
-- │  TABLE: chat_sessions / chat_messages                      │
-- │  Conversational chat foundation                            │
-- └──────────────────────────────────────────────────────────┘

create table if not exists chat_sessions (
  id          uuid        default gen_random_uuid() primary key,
  title       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists chat_messages (
  id                uuid        default gen_random_uuid() primary key,
  session_id        uuid        references chat_sessions(id),
  role              text        not null,
  content           text        not null,
  skills_used       text[],
  tickers_mentioned text[],
  created_at        timestamptz default now()
);

create index if not exists idx_chat_messages_session on chat_messages(session_id);

alter table chat_sessions enable row level security;
alter table chat_messages enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Public rw chat_sessions') then
    create policy "Public rw chat_sessions" on chat_sessions for all using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Public rw chat_messages') then
    create policy "Public rw chat_messages" on chat_messages for all using (true);
  end if;
end $$;


-- ┌──────────────────────────────────────────────────────────┐
-- │  TABLE: subscription_tiers                                 │
-- │  Feature gating for monetization prep                      │
-- └──────────────────────────────────────────────────────────┘

create table if not exists subscription_tiers (
  id              text primary key,
  name            text not null,
  price_monthly   int  not null,
  features        jsonb not null
);

insert into subscription_tiers (id, name, price_monthly, features) values
  ('free', 'Free', 0, '{"screener_limit": 10, "analyses_per_month": 2, "sain_access": false, "portfolio": false, "export": false, "chat": false, "alerts_limit": 1}'),
  ('starter', 'Starter', 29, '{"screener_limit": 100, "analyses_per_month": 20, "sain_access": true, "portfolio": true, "export": true, "chat": false, "alerts_limit": 10}'),
  ('pro', 'Pro', 79, '{"screener_limit": -1, "analyses_per_month": -1, "sain_access": true, "portfolio": true, "export": true, "chat": true, "alerts_limit": -1}'),
  ('institutional', 'Institutional', 199, '{"screener_limit": -1, "analyses_per_month": -1, "sain_access": true, "portfolio": true, "export": true, "chat": true, "alerts_limit": -1, "api_access": true, "custom_reports": true}')
on conflict (id) do nothing;
