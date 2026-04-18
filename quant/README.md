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

## Conventions

Two architectural rules apply across the entire service. Both are
enforced; do not work around them.

### Rule 1 — All logging goes to stderr, never stdout

Stdout is reserved for the MCP stdio transport's JSON-RPC framing.
Any non-JSON-RPC byte on stdout corrupts the protocol and the MCP
client hangs on `initialize()` with no error — extraordinarily
painful to debug.

`simualpha_quant.logging_config` installs a single stderr handler on
the root logger and calls `_assert_no_stdout_handlers()` after
configuration. If any other module attaches a stdout-bound handler
the service crashes loudly at startup with a clear message rather
than silently breaking the protocol.

If you add a new dependency that configures its own logging, redirect
its handler to stderr or remove it. Do not add `print()` calls to
production code paths — use `get_logger(__name__)`.

### Rule 2 — Heavy / optional deps are imported lazily

`supabase`, `openbb`, `pyqlib`, `freqtrade`, `mplfinance`, and
`matplotlib.*` are imported **inside the function that uses them**,
never at module load. Reasons:

- A broken / missing native dep (e.g. `cryptography` cffi backend)
  must not prevent unrelated modules from being importable.
- Tests can stub `tools/get_price_history` without dragging the
  supabase / gotrue / cryptography chain into the test process.
- Importing `simualpha_quant.tools` (or any sibling) must stay fast.

Pattern:

```python
def get_client():
    from supabase import create_client  # lazy: see README "Conventions"
    return create_client(url, key)
```

For type-only references, use `TYPE_CHECKING`:

```python
from typing import TYPE_CHECKING
if TYPE_CHECKING:  # pragma: no cover
    from matplotlib.axes import Axes
```

To audit, run from `quant/`:

```bash
find src -name "*.py" -exec grep -nE \
  "^(from|import)\s+(supabase|openbb|qlib|freqtrade|mplfinance|matplotlib)" {} +
```

This must return zero matches in production source. (The dedicated
`supabase_client.py` module is the only acceptable site for the
supabase import — and even there it lives inside `get_client()`.)

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
| `backtest_pattern`   | `POST /v1/tools/backtest-pattern`  | `backtest_pattern`   | `pattern_stats_cache` (hash-keyed) + qlib binary store |

Stage-3 adds two auxiliary endpoints:
- `GET /v1/jobs/{id}` — poll an async backtest.
- `POST /admin/reload-universe` — force-refresh the `tracked_8500` snapshot.

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

Run once in the Supabase SQL Editor (order matters):
- `supabase/migration_quant_data.sql` — `prices_daily`, `fundamentals_quarterly`, RLS (service role full; authenticated read-only).
- `supabase/migration_quant_charts.sql` — `tli_charts_index` audit table + `tli-charts` Storage bucket (public-read, service-role writes).
- `supabase/migration_quant_backtest.sql` — `pattern_stats_cache`, `pattern_signals` (append-only audit), `backtest_jobs` (async tracking). Same RLS posture.

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
- **Stage 3 (live):** `backtest_pattern` tool (qlib data layer + pure-Python detectors); 5 named patterns + JSON DSL; async job mechanism.
- **Stage 4:** `simulate_strategy` tool (freqtrade).

All TLI thresholds and Fib levels live in `simualpha_quant.tli_constants`;
see `docs/tli-constants.md` for file:line citations. Pattern docs in
`docs/patterns/`. Custom-expression DSL grammar in
`docs/custom-expression-dsl.md`.

Stage 4 stub notes its registry-registration requirement.
