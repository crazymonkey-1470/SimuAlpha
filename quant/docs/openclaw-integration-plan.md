# OpenClaw integration plan

Staged plan for wiring OpenClaw into the SimuAlpha quant service. Four
tools are production-ready; `simulate_strategy` stays gated pending
the Stage-4.5 Railway egress check and the Stage-4.5 real-data
verification.

**Scope (green-lit):**

- `get_price_history`
- `get_fundamentals`
- `render_tli_chart`
- `backtest_pattern`

**Gated (not yet integrated):**

- `simulate_strategy` — ships after both: (a) the Railway egress
  check proves `freqtrade.optimize.backtesting.Backtesting` initializes
  successfully from a Railway service (see
  `quant/scripts/egress_check/README.md`), and (b) the real-data
  verification in `docs/real-data-verification.md` returns numbers
  you're satisfied with.

---

## 1. API key minting

OpenClaw authenticates to the quant service over HTTP with
`Authorization: Bearer <raw-token>`. Tokens are minted into the
existing Supabase `api_keys` table (schema:
`supabase/migration_auth.sql`). The service stores only the SHA-256
hash of the token — the raw token is printed once at mint time and
never recoverable.

Required scope: **`quant:tools`** (enforced in
`simualpha_quant.api.auth.REQUIRED_SCOPE`).

### Preferred — mint via the existing Node script

The SimuAlpha backend already ships an API-key generator that uses
the correct hashing + prefix conventions. This is the one-command
path:

```bash
cd backend
node scripts/generate_api_key.js "OpenClaw" quant:tools
```

Output (printed **once** — capture both lines; the raw token cannot
be retrieved later):

```
============================================================
API KEY GENERATED — SAVE THIS, IT CANNOT BE RECOVERED
============================================================
Key:    sa_live_<48 hex chars>
Name:   OpenClaw
Scopes: quant:tools
ID:     <uuid>
============================================================
```

What that script does internally:

1. `sa_live_${randomBytes(24).toString('hex')}` → 56-char token.
2. SHA-256(token) → `key_hash`.
3. First 8 chars → `key_prefix` (always `sa_live_` so it's purely
   identifying; the secret lives in the remaining 48 hex chars).
4. INSERT into `api_keys` with scope + default rate limits (60/min,
   10 000/day).

### Alternative — pure Supabase SQL (no Node required)

If you prefer the SQL Editor, run this from a local shell that has
Python 3 and `openssl` on the path, then paste the printed INSERT
into Supabase:

```bash
# One-off shell: generates the token, shows it ONCE, emits the SQL.
set -euo pipefail
TOKEN="sa_live_$(openssl rand -hex 24)"
HASH="$(printf '%s' "$TOKEN" | openssl dgst -sha256 -hex | awk '{print $NF}')"
PREFIX="${TOKEN:0:8}"

cat <<SQL
-- Paste into the Supabase SQL Editor (project: <your project>).
-- Raw token is shown ABOVE this comment block — capture it now.
insert into api_keys
  (key_hash, key_prefix, name, scopes, rate_limit_per_minute, rate_limit_per_day, is_active, metadata)
values
  ('${HASH}', '${PREFIX}', 'OpenClaw', ARRAY['quant:tools'], 60, 10000, true,
   '{"issued_by":"integration-plan","issued_at":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}'::jsonb)
returning id, name, scopes, key_prefix, created_at;
SQL

echo
echo "RAW TOKEN (store in OpenClaw secret manager NOW; not recoverable):"
echo "$TOKEN"
```

The returned row (`id`, `name`, `scopes`, `key_prefix`, `created_at`)
confirms the key is active. The raw token is never written back to
Supabase — only the hash is stored.

**Rate limits:** default `60/minute` and `10 000/day`. If OpenClaw's
real-world call pattern exceeds those, bump them per key in the
metadata update block below rather than globally — global changes
affect every scoped client.

```sql
-- Bump OpenClaw's limits without rotating the key.
update api_keys
set rate_limit_per_minute = 120,
    rate_limit_per_day    = 30000,
    metadata = metadata || '{"rate_bumped_at":"YYYY-MM-DDTHH:MM:SSZ"}'::jsonb
where name = 'OpenClaw' and is_active = true;
```

### Verify the key works

From whatever machine will run OpenClaw, hit `/v1/tools` (requires
auth, returns the registered tool list):

```bash
curl -sS -H "Authorization: Bearer $OPENCLAW_QUANT_TOKEN" \
  "$QUANT_API_URL/v1/tools" | jq '.data.tools[].name'
```

Expected (for the four green tools):

```
"get_price_history"
"get_fundamentals"
"render_tli_chart"
"backtest_pattern"
```

A `401` means the hash doesn't match — regenerate. A `403` with
`"Requires scope: quant:tools"` means the row exists but the scope
array is wrong — fix with:

```sql
update api_keys set scopes = ARRAY['quant:tools']
where name = 'OpenClaw' and is_active = true;
```

### Rotation guidance

Tokens have no TTL by default (`expires_at IS NULL`). The intended
rotation cadence:

| Trigger | Action |
| --- | --- |
| **Routine — every 90 days** | Mint a new key with the same scope, update OpenClaw's env var, wait 10 minutes for OpenClaw to pick up the new secret, then deactivate the old key (`is_active = false`). Do not delete the row — `last_used_at` is audit data. |
| **Suspected compromise** | Deactivate immediately (see below), mint a new key, deploy the new secret. Old callers see `401 Invalid API key` on the next request. |
| **Rate-limit bump needed** | Don't rotate — bump via the `update` query above. |
| **Scope change** | Don't rotate — add / remove entries in the `scopes` array. |

#### Rotation SQL

Overlap rotation (preferred — zero downtime):

```sql
-- 1) Mint the new key (run the Node script or the shell+SQL block above).
-- 2) Roll it to OpenClaw and wait for the new env var to be live.

-- 3) Read both keys, confirm both look healthy.
select id, name, key_prefix, is_active, last_used_at, rate_limit_per_minute
from api_keys
where name = 'OpenClaw'
order by created_at desc;

-- 4) Once the NEW key's last_used_at has ticked past the rollout
--    time, deactivate the OLD one (identify by key_prefix — the
--    prefix is always 'sa_live_' in this system, so disambiguate by
--    id or created_at):
update api_keys
set is_active = false,
    metadata = metadata || '{"deactivated_at":"YYYY-MM-DDTHH:MM:SSZ","deactivated_reason":"routine rotation"}'::jsonb
where id = '<old-key-uuid>';
```

Emergency rotation:

```sql
-- Revoke immediately. Next call on the old token gets 401.
update api_keys
set is_active = false,
    metadata = metadata || '{"revoked_at":"YYYY-MM-DDTHH:MM:SSZ","revoked_reason":"<why>"}'::jsonb
where name = 'OpenClaw' and is_active = true;
-- Then mint a new key and deploy.
```

#### Audit query

```sql
-- Last 30 days of usage + rate, all OpenClaw keys (active + deactivated).
select
  id,
  key_prefix,
  is_active,
  created_at,
  last_used_at,
  rate_limit_per_minute,
  rate_limit_per_day,
  metadata
from api_keys
where name = 'OpenClaw'
order by created_at desc;
```

`last_used_at` is updated fire-and-forget by
`simualpha_quant.api.auth._touch_last_used` on every authenticated
request. A key with `is_active = true` and `last_used_at` older than
a week after deploy probably means OpenClaw is using the wrong
secret — check its env.

---

## 2. OpenClaw-side secret storage

OpenClaw is an **external service** — the raw token never lands on
the SimuAlpha side after mint. OpenClaw stores it and sends it on
every request.

### Env var contract

OpenClaw's quant-tool client reads **one** env var:

```
QUANT_API_TOKEN=sa_live_<48 hex chars>
```

(Name is a recommendation, not enforced by the quant service. Pick
whatever your secret-management layer prefers — `SIMUALPHA_QUANT_TOKEN`,
`OPENCLAW_QUANT_KEY`, etc. The value is the raw token from mint.)

Alongside it, set the endpoint:

```
QUANT_API_URL=https://quant-api.<your-railway-domain>.railway.app
```

(Or the private-networking hostname if OpenClaw lives in the same
Railway project: `http://quant-api.railway.internal:8000`. Private
networking is preferred — no public egress, lower latency, no
external DNS.)

### Secret management recommendations

Listed preferred → acceptable. Pick the best one your OpenClaw
runtime supports.

1. **Railway env vars marked secret.** If OpenClaw runs on Railway:
   dashboard → service → Variables → add `QUANT_API_TOKEN`, toggle
   the "Sealed" flag. Railway masks the value in logs and the UI
   after first save. Rotation is a one-click overwrite.

2. **Doppler / 1Password / Infisical.** If you already run a secrets
   manager, register `QUANT_API_TOKEN` there and inject at process
   start. Works well with Railway's "sync" integrations.

3. **Kubernetes Secret / Secrets Manager on AWS|GCP|Azure.** If
   OpenClaw runs outside Railway, create a single-key secret and
   mount as env.

4. **Local `.env` file — ONLY for dev.** Never check this in. The
   `.gitignore` at the repo root already excludes `.env`; verify
   that's still the case on whatever repo hosts OpenClaw.

### Hard requirements wherever you store it

- **Never log the raw token.** `LOG_LEVEL=DEBUG` on OpenClaw's HTTP
  client should redact `Authorization` headers. Run one test call
  with debug logging on before production to confirm.
- **Never bake into a container image.** Env-var injection only. If
  OpenClaw has a Dockerfile, `QUANT_API_TOKEN` must not appear there.
- **Never commit to git, even in a private repo.** History leaks
  outlive rotation windows.
- **Rotate when an operator with clipboard access leaves the team.**
  The Node script prints the raw token to stdout; anyone with a
  terminal scrollback or a screen-recording of the mint moment has
  the secret.
- **One token per caller.** OpenClaw gets its own. If a second
  service needs the quant API later, mint a second `quant:tools`
  key rather than sharing. `last_used_at` audits stay meaningful.

### Deactivation checklist (when retiring the integration)

1. Set `is_active = false` on every `name = 'OpenClaw'` row.
2. Remove `QUANT_API_TOKEN` from the secret manager / Railway vars.
3. Confirm OpenClaw's next call to the quant API returns `401` — if
   it returns `200`, some other key is authorizing it.
4. (Optional) Delete the Supabase rows after retention window, but
   keeping them preserves the audit trail.

---

## 2. Tool schemas

All four schemas below are pulled verbatim from
`simualpha_quant.tools.registry.TOOLS[*].request_model.model_json_schema()`
on branch `claude/stage4-simulate-strategy`. They are the authoritative
contract — if you paste these, the quant service will validate every
inbound payload against exactly these shapes.

### Endpoint / MCP-name summary

| Tool | HTTP endpoint (POST) | MCP tool name |
| --- | --- | --- |
| `get_price_history` | `${QUANT_API_URL}/v1/tools/price-history` | `get_price_history` |
| `get_fundamentals` | `${QUANT_API_URL}/v1/tools/fundamentals` | `get_fundamentals` |
| `render_tli_chart` | `${QUANT_API_URL}/v1/tools/render-tli-chart` | `render_tli_chart` |
| `backtest_pattern` | `${QUANT_API_URL}/v1/tools/backtest-pattern` | `backtest_pattern` |

All four require `Authorization: Bearer $QUANT_API_TOKEN` and
`Content-Type: application/json`.

### Anthropic Messages-API `tools=[...]` block (paste-ready)

Drop this array directly into OpenClaw's `tools` argument. Each entry
is the Anthropic SDK shape — `name` / `description` / `input_schema`.

```json
[
  {
    "name": "get_price_history",
    "description": "Return daily OHLCV for a single ticker between two dates. Cache-first against Supabase prices_daily; backfills from OpenBB on miss or gap at either end of the window.",
    "input_schema": {
      "additionalProperties": false,
      "properties": {
        "ticker": {
          "description": "Equity symbol, upper-cased",
          "maxLength": 12,
          "minLength": 1,
          "title": "Ticker",
          "type": "string"
        },
        "start": {
          "description": "Inclusive start date (YYYY-MM-DD)",
          "format": "date",
          "title": "Start",
          "type": "string"
        },
        "end": {
          "description": "Inclusive end date (YYYY-MM-DD)",
          "format": "date",
          "title": "End",
          "type": "string"
        },
        "timeframe": {
          "const": "daily",
          "default": "daily",
          "title": "Timeframe",
          "type": "string"
        }
      },
      "required": ["ticker", "start", "end"],
      "title": "PriceHistoryRequest",
      "type": "object"
    }
  },
  {
    "name": "get_fundamentals",
    "description": "Return latest quarterly TLI-scoring fundamentals (revenue, ebitda, free_cash_flow, shares_outstanding, total_debt, cash, gross_margin, operating_margin, net_income) for a ticker. Cache-first; refreshes from OpenBB when the newest cached period is older than one quarter.",
    "input_schema": {
      "additionalProperties": false,
      "properties": {
        "ticker": {
          "maxLength": 12,
          "minLength": 1,
          "title": "Ticker",
          "type": "string"
        },
        "metrics": {
          "anyOf": [
            { "items": { "type": "string" }, "type": "array" },
            { "type": "null" }
          ],
          "default": null,
          "description": "Subset of TLI metrics. Omit to receive all known metrics.",
          "title": "Metrics"
        }
      },
      "required": ["ticker"],
      "title": "FundamentalsRequest",
      "type": "object"
    }
  },
  {
    "name": "render_tli_chart",
    "description": "Render a TLI-methodology chart for a ticker with custom annotations. Use this to visually show your reasoning when you've identified a setup. You compose the annotations (Fibonacci levels, wave labels, S/R lines, MAs, zones, entry tranches, badges); this tool renders them. Cache-first by spec hash — repeated identical specs return the same URL without re-rendering.",
    "input_schema": {
      "$defs": {
        "AnnotationsSpec": {
          "additionalProperties": false,
          "properties": {
            "fibonacci_levels": { "items": { "$ref": "#/$defs/FibLevel" }, "title": "Fibonacci Levels", "type": "array" },
            "wave_labels":      { "items": { "$ref": "#/$defs/WaveLabel" }, "title": "Wave Labels", "type": "array" },
            "horizontal_lines": { "items": { "$ref": "#/$defs/HorizontalLine" }, "title": "Horizontal Lines", "type": "array" },
            "moving_averages":  { "items": { "$ref": "#/$defs/MovingAverageSpec" }, "title": "Moving Averages", "type": "array" },
            "zones":            { "items": { "$ref": "#/$defs/Zone" }, "title": "Zones", "type": "array" },
            "entry_tranches":   { "items": { "$ref": "#/$defs/EntryTranche" }, "title": "Entry Tranches", "type": "array" },
            "badges":           { "items": { "$ref": "#/$defs/Badge" }, "title": "Badges", "type": "array" },
            "caption": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Caption" }
          },
          "title": "AnnotationsSpec",
          "type": "object"
        },
        "Badge": {
          "additionalProperties": false,
          "properties": {
            "text": { "title": "Text", "type": "string" },
            "placement": { "default": "top", "enum": ["top", "bottom", "near_zone"], "title": "Placement", "type": "string" },
            "color": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Color" },
            "style": { "default": "pill", "enum": ["pill", "flag", "banner"], "title": "Style", "type": "string" }
          },
          "required": ["text"],
          "title": "Badge",
          "type": "object"
        },
        "ChartConfig": {
          "additionalProperties": false,
          "properties": {
            "width":  { "default": 1200, "maximum": 4000, "minimum": 400, "title": "Width", "type": "integer" },
            "height": { "default": 700,  "maximum": 4000, "minimum": 300, "title": "Height", "type": "integer" },
            "theme":  { "default": "dark", "enum": ["light", "dark"], "title": "Theme", "type": "string" },
            "watermark": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": "SimuAlpha", "title": "Watermark" },
            "show_volume": { "default": true, "title": "Show Volume", "type": "boolean" }
          },
          "title": "ChartConfig",
          "type": "object"
        },
        "DateRange": {
          "additionalProperties": false,
          "properties": {
            "start": { "format": "date", "title": "Start", "type": "string" },
            "end":   { "format": "date", "title": "End",   "type": "string" }
          },
          "required": ["start", "end"],
          "title": "DateRange",
          "type": "object"
        },
        "EntryTranche": {
          "additionalProperties": false,
          "properties": {
            "price": { "title": "Price", "type": "number" },
            "pct":   { "description": "Fraction of total position (0 < pct <= 1)", "exclusiveMinimum": 0.0, "maximum": 1.0, "title": "Pct", "type": "number" },
            "label": { "title": "Label", "type": "string" }
          },
          "required": ["price", "pct", "label"],
          "title": "EntryTranche",
          "type": "object"
        },
        "FibLevel": {
          "additionalProperties": false,
          "properties": {
            "level": { "description": "Fib ratio, e.g. 0.618 or 1.618", "maximum": 4.0, "minimum": 0.0, "title": "Level", "type": "number" },
            "price": { "title": "Price", "type": "number" },
            "label": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Label" },
            "style": { "default": "dashed", "enum": ["solid", "dashed", "dotted"], "title": "Style", "type": "string" },
            "color": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Color" }
          },
          "required": ["level", "price"],
          "title": "FibLevel",
          "type": "object"
        },
        "HorizontalLine": {
          "additionalProperties": false,
          "properties": {
            "price": { "title": "Price", "type": "number" },
            "kind":  { "enum": ["support", "resistance", "bullish_flip", "bearish_flip"], "title": "Kind", "type": "string" },
            "label": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Label" }
          },
          "required": ["price", "kind"],
          "title": "HorizontalLine",
          "type": "object"
        },
        "MovingAverageSpec": {
          "additionalProperties": false,
          "properties": {
            "period": { "exclusiveMinimum": 0, "maximum": 2000, "title": "Period", "type": "integer" },
            "type":   { "default": "SMA", "enum": ["SMA", "EMA"], "title": "Type", "type": "string" },
            "color":  { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Color" }
          },
          "required": ["period"],
          "title": "MovingAverageSpec",
          "type": "object"
        },
        "WaveLabel": {
          "additionalProperties": false,
          "properties": {
            "wave_id":   { "description": "e.g. '1', '2', 'A', 'B'", "maxLength": 4, "minLength": 1, "title": "Wave Id", "type": "string" },
            "wave_type": { "enum": ["impulse", "corrective"], "title": "Wave Type", "type": "string" },
            "price":     { "title": "Price", "type": "number" },
            "date":      { "format": "date", "title": "Date", "type": "string" },
            "label":     { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Label" }
          },
          "required": ["wave_id", "wave_type", "price", "date"],
          "title": "WaveLabel",
          "type": "object"
        },
        "Zone": {
          "additionalProperties": false,
          "properties": {
            "low":   { "title": "Low",   "type": "number" },
            "high":  { "title": "High",  "type": "number" },
            "label": { "title": "Label", "type": "string" },
            "color": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Color" },
            "opacity": { "default": 0.25, "maximum": 1.0, "minimum": 0.0, "title": "Opacity", "type": "number" }
          },
          "required": ["low", "high", "label"],
          "title": "Zone",
          "type": "object"
        }
      },
      "additionalProperties": false,
      "properties": {
        "ticker":    { "maxLength": 12, "minLength": 1, "title": "Ticker", "type": "string" },
        "timeframe": { "default": "daily", "enum": ["daily", "weekly", "monthly"], "title": "Timeframe", "type": "string" },
        "date_range":  { "$ref": "#/$defs/DateRange" },
        "annotations": { "$ref": "#/$defs/AnnotationsSpec" },
        "config":      { "$ref": "#/$defs/ChartConfig" }
      },
      "required": ["ticker", "date_range"],
      "title": "RenderChartRequest",
      "type": "object"
    }
  },
  {
    "name": "backtest_pattern",
    "description": "Validate a pattern against historical data. Returns hit rate and forward-return statistics at 3/6/12/24 months (configurable). Use a pre-built pattern name for known TLI setups (wave_2_at_618, wave_4_at_382, confluence_zone, generational_support, impossible_level), or compose a custom_expression for novel patterns — see docs/custom-expression-dsl.md. Use this whenever you want to justify a call with empirical evidence.",
    "input_schema": {
      "$defs": {
        "DateRange": {
          "additionalProperties": false,
          "properties": {
            "start": { "format": "date", "title": "Start", "type": "string" },
            "end":   { "format": "date", "title": "End",   "type": "string" }
          },
          "required": ["start", "end"],
          "title": "DateRange",
          "type": "object"
        },
        "UniverseSpec": {
          "additionalProperties": false,
          "properties": {
            "universe": {
              "anyOf": [{ "const": "tracked_8500", "type": "string" }, { "type": "null" }],
              "default": null,
              "description": "Named cohort. Use this OR `tickers`, not both.",
              "title": "Universe"
            },
            "tickers": {
              "anyOf": [{ "items": { "type": "string" }, "type": "array" }, { "type": "null" }],
              "default": null,
              "description": "Explicit ticker list. Use this OR `universe`.",
              "title": "Tickers"
            }
          },
          "title": "UniverseSpec",
          "type": "object"
        }
      },
      "additionalProperties": false,
      "properties": {
        "pattern_name": {
          "anyOf": [{ "type": "string" }, { "type": "null" }],
          "default": null,
          "description": "Name of a pre-built pattern from the library (wave_2_at_618, wave_4_at_382, confluence_zone, generational_support, impossible_level).",
          "title": "Pattern Name"
        },
        "custom_expression": {
          "anyOf": [{ "additionalProperties": true, "type": "object" }, { "type": "null" }],
          "default": null,
          "description": "Custom pattern expression in the JSON DSL. See docs/custom-expression-dsl.md.",
          "title": "Custom Expression"
        },
        "universe_spec": { "$ref": "#/$defs/UniverseSpec" },
        "date_range":    { "$ref": "#/$defs/DateRange" },
        "horizons":      { "default": [3, 6, 12, 24], "items": { "type": "integer" }, "title": "Horizons", "type": "array" },
        "params":        { "anyOf": [{ "additionalProperties": true, "type": "object" }, { "type": "null" }], "default": null, "title": "Params" },
        "include_per_year": { "default": true, "title": "Include Per Year", "type": "boolean" },
        "sample_size":      { "default": 10, "maximum": 100, "minimum": 0, "title": "Sample Size", "type": "integer" }
      },
      "required": ["universe_spec", "date_range"],
      "title": "BacktestPatternRequest",
      "type": "object"
    }
  }
]
```

Schema notes the schema itself doesn't make obvious:

- **`get_price_history`:** `timeframe` is currently `const: "daily"`
  (future stages may add weekly/monthly — if so this will loosen to
  an enum, backward-compatible).
- **`get_fundamentals` metrics whitelist:** `revenue`, `ebitda`,
  `free_cash_flow`, `shares_outstanding`, `total_debt`, `cash`,
  `gross_margin`, `operating_margin`, `net_income`. Unknown metrics
  return `422` with the full list in the error.
- **`render_tli_chart` defaults** when `annotations` is empty: TLI
  legend auto-applies — blue S/R, green/red flip, yellow 200-period
  MA keyed to the requested `timeframe`, dark theme, SimuAlpha
  watermark. Caller overrides stay authoritative.
- **`backtest_pattern` XOR:** exactly one of `pattern_name` or
  `custom_expression` must be non-null. Providing both returns
  `422`. Providing neither returns `422`.
- **`UniverseSpec` XOR:** exactly one of `universe` or `tickers`.
  Same rules. `universe: "tracked_8500"` reads from the quant
  service's in-memory snapshot (15-min refresh); `tickers` is a
  per-request explicit list.

### How to call each tool (HTTP POST body examples)

Minimal payloads — enough to hit the happy path from OpenClaw:

```bash
# get_price_history
curl -sS -XPOST "$QUANT_API_URL/v1/tools/price-history" \
  -H "Authorization: Bearer $QUANT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ticker":"HIMS","start":"2024-01-01","end":"2024-12-31"}'

# get_fundamentals
curl -sS -XPOST "$QUANT_API_URL/v1/tools/fundamentals" \
  -H "Authorization: Bearer $QUANT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ticker":"HIMS"}'

# render_tli_chart  (minimal — defaults fill in the TLI legend)
curl -sS -XPOST "$QUANT_API_URL/v1/tools/render-tli-chart" \
  -H "Authorization: Bearer $QUANT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "HIMS",
    "date_range": {"start": "2024-01-01", "end": "2024-12-31"},
    "annotations": {
      "wave_labels": [
        {"wave_id": "1", "wave_type": "impulse",    "price": 11.00, "date": "2023-08-01", "label": "Wave 1"},
        {"wave_id": "2", "wave_type": "corrective", "price": 19.50, "date": "2024-05-06", "label": "Wave 2 low"}
      ],
      "caption": "HIMS Wave 2 at 0.618 fib confluence"
    }
  }'

# backtest_pattern
curl -sS -XPOST "$QUANT_API_URL/v1/tools/backtest-pattern" \
  -H "Authorization: Bearer $QUANT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pattern_name": "wave_2_at_618",
    "universe_spec": {"tickers": ["HIMS","NKE","AAPL"]},
    "date_range": {"start": "2018-01-01", "end": "2024-12-31"},
    "horizons": [3, 6, 12, 24]
  }'
```

### Response envelope (identical for every tool)

Success (`200`):

```json
{
  "success": true,
  "data": { /* tool-specific response body */ },
  "meta": {
    "timestamp": "2026-04-18T...Z",
    "tool": "<tool-name>",
    "elapsed_ms": 123
  }
}
```

Validation / auth / internal error (`400` / `401` / `403` / `422` / `500`):

```json
{
  "success": false,
  "error": "<short-message>",
  "details": "<optional longer context, may be a structured object for 422>",
  "meta": { "timestamp": "..." }
}
```

OpenClaw's tool-call adapter should inspect `success`; on `false`,
log `error` + `details` and surface back to the model as a
tool-error so the model can self-correct (e.g. a `422` for a bad
ticker).

### MCP path (alternative to HTTP)

If OpenClaw uses MCP natively, the tool names above map 1:1 onto
the MCP server's `list_tools` response (server name
`simualpha-quant`, stdio / SSE — see
`docs/openclaw-integration.md` for the connection config).
`tools/call` argument schemas are identical to the `input_schema`
JSON blocks above.

---

**Sections 3–4 (system-prompt additions, test prompt) pending in
separate commits.**
