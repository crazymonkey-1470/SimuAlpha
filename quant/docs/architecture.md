# Architecture overview

Five tools, one shared infrastructure. OpenClaw composes plans;
simualpha-quant executes them, caches results, and returns structured
answers.

## Tools and their relationships

```
            ┌──────────────────────────────────────────────────────┐
            │                       OpenClaw                        │
            │        (reasoning loop, external service)             │
            └──────────────────────────────────────────────────────┘
                              │ HTTP / MCP
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       simualpha-quant                               │
│                                                                     │
│   ┌─────────────────┐   ┌─────────────────┐                         │
│   │ get_price_      │   │ get_fundamentals│                         │
│   │ history         │   │                 │                         │
│   │                 │   │                 │                         │
│   │ cache-first +   │   │ cache-first +   │                         │
│   │ OpenBB on miss  │   │ OpenBB on miss  │                         │
│   └────────┬────────┘   └────────┬────────┘                         │
│            │                     │                                  │
│            ▼                     ▼                                  │
│   ┌──────────────────────────────────────┐                          │
│   │  Supabase: prices_daily,             │                          │
│   │            fundamentals_quarterly    │                          │
│   └──────────────┬───────────────────────┘                          │
│                  │                                                  │
│   ┌──────────────┴──────────────────────────────────────────┐       │
│   │                                                          │       │
│   ▼                                                          ▼       │
│ ┌──────────────┐                      ┌───────────────────────┐     │
│ │ render_tli_  │  ◄───────────────────┤ backtest_pattern      │     │
│ │ chart        │  (same-process fn    │                       │     │
│ │              │   call from sim.)    │ 5 detectors + DSL,    │     │
│ │ mplfinance + │                      │ hit rate at 3/6/12/24m│     │
│ │ Supabase     │                      │ async jobs            │     │
│ │ Storage      │                      └───────────┬───────────┘     │
│ │ (tli-charts) │                                  │                 │
│ └───────▲──────┘                                  │                 │
│         │ in-process                              │                 │
│         │ function call                           │                 │
│         │ (never HTTP / MCP)                      │                 │
│         │                                         │                 │
│   ┌─────┴─────────────────────┐                   │                 │
│   │ simulate_strategy         │                   │                 │
│   │                           │                   │                 │
│   │ StrategySpec DSL +        │                   │                 │
│   │ 5-tranche DCA +           │                   │                 │
│   │ freqtrade IStrategy +     │                   │                 │
│   │ per-horizon outcomes +    │                   │                 │
│   │ trade_log_sample charts   │                   │                 │
│   │ (via render_tli_chart)    │                   │                 │
│   │ async jobs                │                   │                 │
│   └───────────┬───────────────┘                   │                 │
│               │                                   │                 │
│               ▼                                   ▼                 │
│   ┌──────────────────────────────────────────────────────────────┐ │
│   │ Supabase: tli_charts_index, pattern_stats_cache,             │ │
│   │           pattern_signals, backtest_jobs,                    │ │
│   │           simulation_results                                 │ │
│   └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                   ┌────────────────────┐
                   │ qlib binary store  │
                   │ (Stage 3 adapter)  │
                   │ populated from     │
                   │ prices_daily       │
                   └────────────────────┘
```

## Where OpenClaw plugs in

Two equivalent transports:

- **HTTP** (`POST /v1/tools/<name>` + `GET /v1/jobs/{id}` polling).
  Standard for production; async-job aware.
- **MCP** — same tool surface over stdio (local dev / Claude Desktop)
  or SSE (production). Synchronous-only; prefer HTTP for expensive
  calls like simulate_strategy.

Auth: `Authorization: Bearer <token>` validated against Supabase
`api_keys` with required scope `quant:tools`. Break-glass via
`QUANT_SERVICE_BOOTSTRAP_TOKEN` env var (logs a warning on every use).

## Shared infrastructure

### tli_constants (Stage 3 prerequisite)

Every TLI threshold and Fib ratio lives in
`simualpha_quant.tli_constants` — documented with file:line citations
in `docs/tli-constants.md`. Patterns and strategies import from this
module; hard-coding these values anywhere else is a code-review block.

### Conventions (enforced)

- **Rule 1 — stderr logging only.** Stdout is reserved for MCP
  stdio's JSON-RPC framing; the logger installs on stderr and
  `_assert_no_stdout_handlers()` runs after configuration to crash
  early if any module attached a stdout handler.
- **Rule 2 — lazy heavy imports.** `supabase`, `openbb`, `pyqlib`,
  `freqtrade`, `mplfinance`, `matplotlib.*` are imported inside the
  function that uses them, never at module load. Audit with
  `find src -name "*.py" -exec grep -nE "^(from|import)\s+(supabase|openbb|qlib|freqtrade|mplfinance|matplotlib)" {} +` — must return zero matches.

### Cross-tool integration (same-process only)

`simulate_strategy` renders per-trade charts by directly calling
`simualpha_quant.tools.render_chart.render_tli_chart` — a pure Python
function import. **Never HTTP, never MCP.** Caches are keyed on
spec-hashes so repeat simulations reuse existing chart URLs instantly.

## Stage progression

| Stage | Tool | Primary tech | Supabase |
| --- | --- | --- | --- |
| 1 | `get_price_history`, `get_fundamentals` | OpenBB | `prices_daily`, `fundamentals_quarterly` |
| 2 | `render_tli_chart` | mplfinance + matplotlib | `tli_charts_index` + `tli-charts` bucket |
| 3 | `backtest_pattern` | qlib binary + pure-Python detectors + DSL | `pattern_stats_cache`, `pattern_signals`, `backtest_jobs` |
| 4 | `simulate_strategy` | freqtrade as library + StrategySpec DSL | `simulation_results` |

## Deployment

Single Dockerfile, three Railway services:

- **quant-api** — FastAPI service. `requirements.txt` only.
- **quant-mcp** — MCP SSE server. `requirements.txt` only.
- **quant-cron** — Railway cron for CLI ingestion (`fetch-prices`,
  `fetch-fundamentals`). `requirements.txt` only.

Stage 4's simulate_strategy has two deployment options:

- **Combined:** install `requirements.txt` + `requirements-stage4.txt`
  on `quant-api`. Simplest; simulate_strategy runs on the same worker
  as the other tools.
- **Dedicated worker:** a fourth Railway service with Stage-4 extras
  that handles only `/v1/tools/simulate-strategy` (routed via a
  light in-front proxy / nginx). Recommended when simulate load
  becomes noticeable.

`requirements-stage4.txt` pulls `pandas-ta` from git (PyPI release is
incompatible with Python 3.11) and `freqtrade==2024.11`.
