# SimuAlpha Quant Research Service

## Architecture: tools for OpenClaw

This service is a **tool provider**, not an agent. OpenClaw (running
elsewhere on Railway) is the reasoning loop. The quant service exposes
capabilities OpenClaw can call — never the other way around.

Every capability has **three layers**:

1. **Pure function** in `simualpha_quant.tools.<name>` — business logic,
   no transport.
2. **HTTP endpoint** in `simualpha_quant.api` — FastAPI wrapper around
   the pure function. Bearer-token auth against Supabase `api_keys`.
3. **MCP tool** in `simualpha_quant.mcp` — identical wrapper for the
   MCP protocol. Same binary, stdio for local dev and SSE for Railway.

A single registry in `simualpha_quant.tools.registry.TOOLS` is read by
both the FastAPI app and the MCP server. Adding a tool is one place,
not three.

No LLM clients or reasoning logic live in this service. OpenClaw owns
that.

## Role in the monorepo

- **backend/** (Node/Express): user-facing API, scoring, alerts, app-state Supabase writes
- **scraper/** (Python/FastAPI): on-demand fundamentals/historical from Polygon and web sources
- **frontend/** (Vite/React): UI
- **quant/** (this service): OpenBB-backed cache-first tools for OpenClaw + Stage 2–4 research/chart/strategy tools

## Components

### Tools (live)
| Tool | HTTP | MCP | Source of truth |
| --- | --- | --- | --- |
| `get_price_history`  | `POST /v1/tools/price-history`     | `get_price_history`  | `prices_daily` (OpenBB on miss)              |
| `get_fundamentals`   | `POST /v1/tools/fundamentals`      | `get_fundamentals`   | `fundamentals_quarterly` (OpenBB on miss)    |
| `render_tli_chart`   | `POST /v1/tools/render-tli-chart`  | `render_tli_chart`   | Supabase Storage `tli-charts` (content-addressed by spec hash) |

### CLI — cache warmer (not agent-facing)
The CLI's role is to populate Supabase ahead of time so that
agent-initiated tool calls are fast. The agent-on-demand path
(cache-first, OpenBB on miss) is the primary flow; the CLI is a
scheduled warmer for the universe we track.

```bash
python -m simualpha_quant.cli fetch-prices       --tickers HIMS,NKE --start 2020-01-01 --end 2024-12-31
python -m simualpha_quant.cli fetch-fundamentals --tickers HIMS,NKE
```

## Local setup

```bash
cd quant
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in values
```

## Running

**HTTP API:**
```bash
export PYTHONPATH=src
uvicorn simualpha_quant.api.app:app --host 0.0.0.0 --port 8000
# OpenAPI docs: http://localhost:8000/docs
```

**MCP server — stdio (Claude Code / local):**
```bash
python -m simualpha_quant.mcp.server
```

**MCP server — SSE (Railway / production):**
```bash
python -m simualpha_quant.mcp.server --transport sse --host 0.0.0.0 --port 8765
```

## Authentication

- **Production:** OpenClaw uses a `Bearer <token>` whose SHA-256 hash is stored in the Supabase `api_keys` table (same table the Node backend already uses — minted via `backend/scripts/generate_api_key.js`). Required scope: **`quant:tools`**.
- **Break-glass:** set `QUANT_SERVICE_BOOTSTRAP_TOKEN=<raw-token>` in the environment. A raw equality match with the bearer token authorizes the request **and logs a WARNING on every use**. Remove once every caller has a scoped Supabase-minted key.

See `docs/openclaw-integration.md` for curl and MCP client examples.

## Tests

```bash
pytest
```

## Supabase schema

Run once in the Supabase SQL Editor:
- `supabase/migration_quant_data.sql` — `prices_daily`, `fundamentals_quarterly`, RLS (service role full; authenticated read-only).
- `supabase/migration_quant_charts.sql` — `tli_charts_index` audit table + `tli-charts` Storage bucket (public-read, service-role writes).

The `api_keys` table is already provisioned via `supabase/migration_auth.sql` (backend). Mint a key with scope `quant:tools`:

```bash
cd backend
node scripts/generate_api_key.js "OpenClaw" quant:tools
```

## Deployment (Railway)

Three Railway services, all from this single directory, same image, different start commands:

| Service | Start command | Config reference |
| --- | --- | --- |
| `quant-api` | `uvicorn simualpha_quant.api.app:app --host 0.0.0.0 --port $PORT` | `railway.api.json` |
| `quant-mcp` | `python -m simualpha_quant.mcp.server --transport sse --host 0.0.0.0 --port $PORT` | `railway.mcp.json` |
| `quant-cron` | Railway cron jobs running `python -m simualpha_quant.cli …` | n/a |

Both long-running services healthcheck `/health`.

## Environment variables

| Key | Purpose |
| --- | --- |
| `OPENBB_PAT` | OpenBB Platform personal access token |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service-role key (RLS bypass) |
| `ANTHROPIC_API_KEY` | Reserved for downstream tools; unused today |
| `QUANT_SERVICE_BOOTSTRAP_TOKEN` | Break-glass bearer token; WARNING on every use |

## Stage plan

- **Stage 1 (live):** `get_price_history` + `get_fundamentals` tools; CLI cache warmer; Supabase migration.
- **Stage 2 (live):** `render_tli_chart` tool (mplfinance), Supabase Storage.
- **Stage 3:** `backtest_pattern` tool (qlib).
- **Stage 4:** `simulate_strategy` tool (freqtrade).

Stage 3–4 stubs note their registry-registration requirement.
