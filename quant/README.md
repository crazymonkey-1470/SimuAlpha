# SimuAlpha Quant Research Service

Python service that owns quantitative research, backtesting, charting, and
data ingestion for the SimuAlpha stock analysis platform.

## Role in the monorepo

- **backend/** (Node/Express): user-facing API, scoring, alerts, Supabase writes for app state
- **scraper/** (Python/FastAPI): on-demand fundamentals/historical fetches from Polygon and web sources
- **frontend/** (Vite/React): UI
- **quant/** (this service): batch ingestion of clean OHLCV and fundamentals via OpenBB, factor research with qlib, TLI chart rendering with mplfinance, and strategy validation with freqtrade

This service is **cron-driven**, not request/response. It writes to Supabase
tables that the backend reads.

## Build stages

- **Stage 1 (current):** OpenBB ingestion → Supabase (`prices_daily`, `fundamentals_quarterly`)
- **Stage 2:** TLI chart renderer (mplfinance)
- **Stage 3:** qlib adapter + TLI factor expressions
- **Stage 4:** freqtrade strategy with 5-tranche DCA

Modules for Stages 2–4 exist as stubs with TODO lists.

## Local setup

```bash
cd quant
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in values
```

## Running

Ingest prices:

```bash
python -m simualpha_quant.cli fetch-prices \
  --tickers HIMS,NKE \
  --start 2020-01-01 \
  --end 2024-12-31
```

Ingest fundamentals:

```bash
python -m simualpha_quant.cli fetch-fundamentals --tickers HIMS,NKE
```

## Tests

```bash
pytest
```

The smoke test (`tests/test_smoke.py`) verifies the four core libraries
(openbb, qlib, mplfinance, freqtrade) import cleanly.

## Supabase schema

See `supabase/migration_quant_data.sql` at the repo root. Two tables:

- `prices_daily` — daily OHLCV, keyed on `(ticker, date)`
- `fundamentals_quarterly` — long-format metrics, keyed on `(ticker, period_end, metric_name)`

RLS: service role has full access, authenticated role is read-only.

## Deployment (Railway)

Railway auto-detects the Dockerfile. Configure as a **cron service**, not a
long-running web service. The `CMD` in the Dockerfile defaults to printing
help; override with the cron command in Railway.

A commented Railway cron placeholder is in `Dockerfile`.

## Environment variables

| Key | Purpose |
| --- | --- |
| `OPENBB_PAT` | OpenBB Platform personal access token |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service-role key (RLS bypass) |
| `ANTHROPIC_API_KEY` | Claude API key (for later stages) |
