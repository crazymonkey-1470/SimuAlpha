# OpenClaw integration guide

This service exposes capabilities for OpenClaw to call. OpenClaw never
runs inside the quant service.

Two equivalent transports: **HTTP** (FastAPI) and **MCP** (stdio or SSE).
Both expose the same tools from the same registry.

## Provision a key

Mint a scoped key once per caller (OpenClaw, CI, another internal agent):

```bash
cd backend
node scripts/generate_api_key.js "OpenClaw" quant:tools
# prints the raw token exactly once — save it
```

That token is the value OpenClaw sends as `Authorization: Bearer …`.

## Break-glass

Before a Supabase key is minted, set `QUANT_SERVICE_BOOTSTRAP_TOKEN` in
the quant service environment. Match that value verbatim in
`Authorization: Bearer …` — a warning is logged every time this path is
taken, so don't leave it set in production.

## HTTP (FastAPI)

Base URL (Railway private networking):
`http://quant-api.railway.internal:8000`

Base URL (public, if exposed): whatever Railway-generated domain the
`quant-api` service has.

Response envelope matches the Node backend:
```json
{ "success": true, "data": <tool result>, "meta": { "timestamp": "…", "tool": "…", "elapsed_ms": 42 } }
```

Failures:
```json
{ "success": false, "error": "…", "details": <optional>, "meta": { "timestamp": "…" } }
```

### `POST /v1/tools/price-history`

```bash
curl -s https://quant-api.example.com/v1/tools/price-history \
  -H "Authorization: Bearer $OPENCLAW_QUANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "HIMS",
    "start": "2023-01-01",
    "end":   "2024-12-31"
  }'
```

### `POST /v1/tools/fundamentals`

```bash
curl -s https://quant-api.example.com/v1/tools/fundamentals \
  -H "Authorization: Bearer $OPENCLAW_QUANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "NKE",
    "metrics": ["revenue", "ebitda", "free_cash_flow"]
  }'
```

Omit `metrics` to receive all TLI-scoring metrics (revenue, ebitda,
free_cash_flow, shares_outstanding, total_debt, cash, gross_margin,
operating_margin, net_income).

### `POST /v1/tools/backtest-pattern`

Validate a pattern against historical data. Returns hit rate + forward
return statistics at 3 / 6 / 12 / 24 months (configurable). Use a
pre-built pattern name or compose a `custom_expression` in the DSL.

Synchronous by default. Three conditions trigger async mode (HTTP 202
with a `job_id` — poll `GET /v1/jobs/{id}`):

1. `?async=true` query string (explicit).
2. `len(tickers) * num_years > 1000` (pre-emptive; engine would take a while).
3. Sync run exceeds 5 seconds (watchdog; returns `job_id` mid-flight).

Sync example (named pattern):
```bash
curl -s https://quant-api.example.com/v1/tools/backtest-pattern \
  -H "Authorization: Bearer $OPENCLAW_QUANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pattern_name": "wave_2_at_618",
    "universe_spec": {"tickers": ["HIMS", "NKE", "AAPL"]},
    "date_range": {"start": "2015-01-01", "end": "2024-12-31"},
    "horizons": [3, 6, 12, 24],
    "include_per_year": true
  }'
```

Async example (named universe, whole of tracked_8500):
```bash
curl -s "https://quant-api.example.com/v1/tools/backtest-pattern?async=true" \
  -H "Authorization: Bearer $OPENCLAW_QUANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pattern_name": "confluence_zone",
    "universe_spec": {"universe": "tracked_8500"},
    "date_range": {"start": "2010-01-01", "end": "2024-12-31"}
  }'
# → 202 Accepted
# {"success": true, "data": {"job_id": "…", "status": "queued"}, ...}

# Poll:
curl -s https://quant-api.example.com/v1/jobs/<job_id> \
  -H "Authorization: Bearer $OPENCLAW_QUANT_TOKEN"
```

Custom DSL example:
```bash
curl -s https://quant-api.example.com/v1/tools/backtest-pattern \
  -H "Authorization: Bearer $OPENCLAW_QUANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "custom_expression": {
      "all": [
        {"distance_pct": {"a": "$close", "b": {"sma": ["$close", 200, "daily"]}, "max": 0.02}},
        {"gt":           {"a": "$close", "b": {"sma": ["$close", 50,  "daily"]}}}
      ]
    },
    "universe_spec": {"tickers": ["HIMS", "NKE"]},
    "date_range": {"start": "2020-01-01", "end": "2024-12-31"}
  }'
```

See `docs/custom-expression-dsl.md` for the full grammar and
`docs/patterns/` for per-pattern definitions.

### `GET /v1/jobs/{job_id}`

Poll an async backtest. Returns `{job_id, status: queued|running|done|error,
submitted_at, started_at, completed_at, result, error}`. When `status == "done"`,
`result` contains the full `BacktestPatternResponse`.

### `POST /admin/reload-universe`

Force a refresh of the in-memory `tracked_8500` snapshot. Auth
required. Otherwise the snapshot refreshes automatically every
15 minutes at startup.

### `POST /v1/tools/simulate-strategy`

Simulate a full plan — entry + tranche ladder + exit legs + stop +
position sizing — against historical data. Returns Sharpe / Sortino /
profit factor / Calmar / max drawdown, per-horizon outcomes, a
downsampled equity curve (close + OHLC), and up to `chart_samples`
annotated trade charts.

**Use this *after* `backtest_pattern`.** Backtest validates the
signal; simulate validates the full plan. Simulations are expensive —
prefer async.

Three async triggers (same semantics as `backtest_pattern`):
1. `?async=true` explicit.
2. Cost pre-emptive: `len(tickers) * num_years > SIMULATE_SYNC_COST_LIMIT = 200`.
3. Sync watchdog: any run exceeding 10 s converts mid-flight.

Chart rendering:
- `chart_samples ∈ [0, 5]` — rendered inline synchronously.
- `chart_samples ∈ [6, 20]` — rendered asynchronously. Response's
  `trade_log_sample[i]` carries `chart_status: "pending"` and a
  `charts_job_id`. Poll `GET /v1/jobs/{charts_job_id}`; cached
  simulation row is patched with URLs as charts land.

Full grammar: [`docs/strategy-dsl.md`](./strategy-dsl.md).

Example (sync, 3 charts, walked Wave-2-at-0.618 plan on HIMS):

```bash
curl -s https://quant-api.example.com/v1/tools/simulate-strategy \
  -H "Authorization: Bearer $OPENCLAW_QUANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "strategy": {
      "entry": {"pattern_name": "wave_2_at_618"},
      "exit": {
        "take_profit": [
          {"pct_of_position": 0.2, "price_rule": {"type": "at_fib", "level": 1.618}},
          {"pct_of_position": 0.5, "price_rule": {"type": "at_fib", "level": 2.618}},
          {"pct_of_position": 0.3, "price_rule": {"type": "at_ma", "period": 50, "freq": "daily"}}
        ],
        "stop_loss": {"price_rule": {"type": "at_price", "price": 11.00}, "type": "hard"},
        "time_stop_days": 540
      },
      "position_sizing": {"method": "fixed", "params": {"stake_usd": 10000}},
      "universe_spec": {"tickers": ["HIMS"]},
      "date_range":    {"start": "2023-01-01", "end": "2024-12-31"}
    },
    "chart_samples": 5
  }'
```

Example (async universe-wide):

```bash
curl -s "https://quant-api.example.com/v1/tools/simulate-strategy?async=true" \
  -H "Authorization: Bearer $OPENCLAW_QUANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "strategy": {"...": "..."},
    "chart_samples": 12
  }'
# → 202 { "job_id": "...", "status": "queued" }
curl -s https://quant-api.example.com/v1/jobs/<job_id> \
  -H "Authorization: Bearer $OPENCLAW_QUANT_TOKEN"
```

### `POST /v1/tools/render-tli-chart`

Render a chart that shows OpenClaw's reasoning. OpenClaw composes the
annotations; the tool renders them faithfully. Cached by spec hash:
identical requests return the same URL without re-rendering.

```bash
curl -s https://quant-api.example.com/v1/tools/render-tli-chart \
  -H "Authorization: Bearer $OPENCLAW_QUANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d @quant/docs/examples/hims_wave2_confluence.json
```

Response (`data` payload):
```json
{
  "url": "https://<project>.supabase.co/storage/v1/object/public/tli-charts/charts/HIMS/daily/<hash>.png",
  "cached": false,
  "hash": "…",
  "width": 1280,
  "height": 720,
  "generated_at": "2026-04-18T…Z"
}
```

`AnnotationsSpec` fields (omit any you don't want):

| Field | Meaning |
| --- | --- |
| `fibonacci_levels[]` | `{level, price, label?, style?, color?}` — dashed by default, TLI color ladder by level |
| `wave_labels[]` | `{wave_id, wave_type, price, date, label?}` — green circles for impulse, red for corrective |
| `horizontal_lines[]` | `{price, kind, label?}` — `support`/`resistance` blue, `bullish_flip` green, `bearish_flip` red |
| `moving_averages[]` | `{period, type, color?}` — empty defaults to 200-period yellow |
| `zones[]` | `{low, high, label, color?, opacity?}` — shaded bands |
| `entry_tranches[]` | `{price, pct, label}` — right-edge arrow with `%` |
| `badges[]` | `{text, placement, color?, style?}` — pill at top by default |
| `caption` | short single-line header above the chart |

`ChartConfig`: `{width, height, theme: "dark"|"light", watermark, show_volume}`. All fields optional.

### How the agent uses the chart tool

When OpenClaw has identified a setup, the intended flow is:

1. **`get_price_history`** and **`get_fundamentals`** — load the raw
   facts for the thinking step.
2. **Reason** — locate S/R, compute Fib retracements from the Wave 1
   impulse, identify where the 200 MA sits, tag wave turning points,
   pick 5 DCA tranches.
3. **`render_tli_chart`** — send the composed `AnnotationsSpec` so
   humans (and OpenClaw's own logs) can see the thesis visually. The
   URL is stable and cacheable; pass it through to Discord, Telegram,
   email digests, or embed it in a Resend template.
4. Subsequent stages (**`backtest_pattern`**, **`simulate_strategy`**)
   can reference the same `hash` later for audit.

Example reasoning snippet OpenClaw might produce:

> "HIMS is holding the 0.618 retracement of its Aug 2023 → Mar 2024
> impulse. That level is $19.50 and it coincides with the 50-day SMA.
> I'm marking a 5-tranche DCA between $20.20 and $18.50. Wave 3 target
> by 1.618 extension: $40.85."

The chart returned by `render_tli_chart` with the spec in
`docs/examples/hims_wave2_confluence.json` is exactly that reasoning,
visualized.

### Introspection

```bash
curl -s https://quant-api.example.com/v1/tools \
  -H "Authorization: Bearer $OPENCLAW_QUANT_TOKEN"
```

Returns the registered tools with their JSON request/response schemas.

### Health

```bash
curl -s https://quant-api.example.com/health
```

## MCP

Same tools, MCP protocol. Useful when OpenClaw (or Claude Code / Claude
Desktop for local dev) consumes tools via MCP rather than HTTP.

### SSE transport (Railway / production)

Server command (already baked into `railway.mcp.json`):
```
python -m simualpha_quant.mcp.server --transport sse --host 0.0.0.0 --port $PORT
```

Client config (Claude Desktop, OpenClaw, or any MCP client):
```json
{
  "mcpServers": {
    "simualpha-quant": {
      "transport": "sse",
      "url": "https://quant-mcp.example.com/sse"
    }
  }
}
```

### stdio transport (local dev)

Client config:
```json
{
  "mcpServers": {
    "simualpha-quant": {
      "command": "python",
      "args": ["-m", "simualpha_quant.mcp.server"],
      "cwd": "/path/to/SimuAlpha/quant",
      "env": {
        "PYTHONPATH": "src",
        "SUPABASE_URL": "…",
        "SUPABASE_SERVICE_KEY": "…",
        "OPENBB_PAT": "…"
      }
    }
  }
}
```

### Tool names

- `get_price_history` — input: `{ticker, start, end, timeframe="daily"}`
- `get_fundamentals`  — input: `{ticker, metrics?: [string]}`
- `render_tli_chart`  — input: `{ticker, timeframe, date_range, annotations, config}` (see AnnotationsSpec above)
- `backtest_pattern`  — input: `{pattern_name? | custom_expression?, universe_spec, date_range, horizons?, params?, include_per_year?, sample_size?}`. Returns the same shape the HTTP tool returns. MCP path is synchronous — for long-running backtests, prefer the HTTP transport with the async job flow.
- `simulate_strategy` — input: `{strategy: StrategySpec, chart_samples?}` (see `docs/strategy-dsl.md` for StrategySpec). MCP path is synchronous — simulate is expensive; prefer HTTP with async job flow for multi-ticker runs.

Output shapes: whatever the Pydantic models in `simualpha_quant.schemas.*`
return, serialized as a JSON string inside an MCP `TextContent` block.

## Adding a new tool

1. Implement the pure function in `src/simualpha_quant/tools/<name>.py`.
2. Add Pydantic v2 request/response models to
   `src/simualpha_quant/schemas/`.
3. Append a `ToolSpec` to `TOOLS` in
   `src/simualpha_quant/tools/registry.py`.
4. Don't touch the HTTP or MCP layers — they will pick the tool up
   automatically on next start.
