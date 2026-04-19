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

### 1.5 OpenClaw-side secret storage

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

## 3. System-prompt additions for OpenClaw

These are the exact blocks to append to OpenClaw's existing system
prompt (or paste into its "tools available" / "instructions" section
— whichever OpenClaw's orchestration layer uses). They teach the
model three things: what each tool does, when to use it, and what
order to use them in.

Two blocks: a compact version (preferred — most prompts already run
long) and a verbose version (drop-in if OpenClaw has budget for it).
Pick one, not both.

### 3.1 Compact version — ~450 tokens (paste-ready)

```text
# SimuAlpha quant tools

You have access to four HTTP tools for quantitative stock analysis.
Use them to ground your reasoning in cached market data and
empirical backtests. Never fabricate price levels, fundamentals,
or hit-rate statistics — if you don't have a tool result, say so.

## The tools

1. `get_price_history(ticker, start, end)` — daily OHLCV for one
   ticker between two dates. Cache-first; seconds to return.
2. `get_fundamentals(ticker, metrics?)` — latest quarterly
   fundamentals used by the TLI scoring engine (revenue, ebitda,
   free_cash_flow, shares_outstanding, total_debt, cash,
   gross_margin, operating_margin, net_income). Omit `metrics` to
   get all nine.
3. `backtest_pattern(pattern_name, universe_spec, date_range,
   horizons?)` — validate a pattern against history. Returns hit
   rate + forward-return stats at 3 / 6 / 12 / 24 months by default.
   Pattern names: wave_2_at_618, wave_4_at_382, confluence_zone,
   generational_support, impossible_level. Use to cite empirical
   evidence.
4. `render_tli_chart(ticker, date_range, annotations)` — produce an
   annotated PNG of a setup. You compose the annotations
   (wave labels, Fib levels, S/R lines, moving averages, zones,
   DCA tranches, badges, caption). Use this to visually communicate
   a thesis you've already formed — not to "see what a chart looks
   like."

## Call sequence (follow in order unless the user interrupts)

When a user asks for a stock analysis or a TLI setup review:

  (A) get_price_history + get_fundamentals   → facts
  (B) reason internally (no tool calls)      → thesis
  (C) backtest_pattern                       → empirical support
  (D) render_tli_chart                       → visualize thesis

Skip (C) when: the user is asking for a snapshot, not a trade idea.
Skip (D) when: the user asked for text only, or the thesis is too
weak to visualize (e.g. no clear wave structure).

## When NOT to call a tool

- Don't call `get_price_history` if you just called it for the same
  ticker and date range within this conversation — reuse the prior
  result.
- Don't call `render_tli_chart` before you've formed a thesis. A
  chart of "I don't know what this is" has no value.
- Don't call `backtest_pattern` on a `tickers: [<one ticker>]`
  universe — hit-rate statistics on n=1..3 signals are not
  meaningful. Use the named cohort `"universe": "tracked_8500"` or
  an explicit list of at least 20 tickers.
- Don't call any tool without a clearly stated reason the user
  (human operator reading your reasoning log) would agree with.
```

### 3.2 Verbose version — ~1 100 tokens (drop-in)

```text
# SimuAlpha quant tools — extended guidance

You have access to four HTTP tools that let you pull real market
data, validate patterns against history, and produce annotated
charts. The tools wrap a Supabase cache in front of OpenBB; calls
are idempotent and typically return in under a second.

## Hard rules

- Never invent a price, fundamental, or hit rate. If a tool result
  is missing, say "I don't have that data" and either call the tool
  or explain why you won't.
- Never call the same tool twice with identical arguments in one
  conversation. Reuse the prior result from your reasoning context.
- Never render a chart you haven't earned with reasoning. The chart
  tool exists to visualize a thesis, not to decide one.
- Every tool call should have a one-sentence justification you
  could defend to the user if asked "why did you call that?"

## 1. `get_price_history`

Returns daily OHLCV (open / high / low / close / volume, plus
`adj_close` adjusted for splits + dividends) for one ticker across
a date range.

Use when:
- You need actual price history to reason about wave structure,
  support / resistance, MA confluence, or volatility.
- A user mentions a specific ticker and you don't already have its
  recent price context in your conversation.

Don't use when:
- The user only wants a one-line quote or thesis statement.
- You already pulled the same ticker + range this conversation.
- You need intraday data — this is daily bars only.

## 2. `get_fundamentals`

Returns the nine quarterly fundamentals used by the TLI scoring
engine: revenue, ebitda, free_cash_flow, shares_outstanding,
total_debt, cash, gross_margin, operating_margin, net_income.
Omit `metrics` to get all nine; pass a subset if you want fewer.

Use when:
- You need to assess business quality before acting on a chart
  pattern. TLI methodology says "chart gets you excited,
  fundamentals get you in."
- User asks about margin trends, growth trajectory, or balance-
  sheet strength.

Don't use when:
- User only wants a technical read. TLI charts can stand alone for
  pure-technical questions.
- Ticker has been public < 4 quarters — `get_fundamentals` may
  return sparse or no data for recent IPOs.

## 3. `backtest_pattern`

Validates a named pattern (or custom DSL expression) against
historical data. Returns per-horizon hit rate, median / p25 / p75
forward returns, max drawdown, plus a sample of signal dates for
spot-checking.

Pattern names available today:
- `wave_2_at_618`  — Wave 2 retracement to 0.5-0.618 fib, 50-day
                     MA confirmation. The primary TLI entry.
- `wave_4_at_382`  — Wave 4 retracement to 0.382 fib, non-overlap
                     with Wave 1 territory.
- `confluence_zone`      — 200WMA + 0.618 fib within 3%.
- `generational_support` — 0.786 fib + Wave 1 origin + 200MMA
                           within 15%.
- `impossible_level`     — recurring horizontal S/R + 0.786 fib +
                           200MMA convergence.

Use when:
- You've identified a potential setup and want empirical backing
  before you state a conviction level to the user.
- User asks "how often does this pattern work?" — this is the
  only tool that can answer honestly.

Don't use when:
- The universe is tiny. `tickers: ["HIMS"]` means hit-rate stats
  will be computed on n=1..3 signals. Use `universe: "tracked_8500"`
  or provide ≥ 20 explicit tickers.
- You've already backtested the same pattern + universe + window
  this conversation — results are cached, but also already in your
  context.

## 4. `render_tli_chart`

Produces an annotated chart PNG (URL returned). You compose every
annotation — wave labels, Fibonacci levels, support/resistance
lines, moving averages, zones, DCA tranches, badges, caption. The
tool renders exactly what you specify; it does not decide.

Omitting an annotation field applies the TLI legend default: blue
horizontal S/R, green/red flip lines, yellow 200-period MA, green
impulse circles, red corrective circles, SimuAlpha watermark, dark
theme.

Use when:
- You've formed a thesis ("HIMS is setting up as Wave 2 at 0.618
  fib in a confluence zone") and want to show the user the
  structure visually.
- A downstream consumer (Discord / email / a report) needs a
  chart asset with wave labels baked in.

Don't use when:
- You don't yet have a thesis. A chart with no annotations is just
  candlesticks — call `get_price_history` and think before calling
  the renderer.
- The user explicitly asked for text only.

## Call sequence

Default flow for "analyze <ticker>" or "is <ticker> a TLI setup":

  1. `get_price_history(<ticker>, <recent 2-3 years>, <today>)`
  2. `get_fundamentals(<ticker>)`
  3. Reason internally: identify wave structure, note fib levels,
     check MA context, assess fundamental passes / fails.
  4. If a pattern is plausible, `backtest_pattern(<pattern>,
     <tracked_8500 or curated cohort>, <5-10 year window>)` to
     cite hit rates.
  5. If thesis is clear, `render_tli_chart(<ticker>, <window>,
     <annotations from step 3>)` to visualize.

Simpler flows are fine:
- Pure quote request: step 1 only.
- Business-quality question: step 2 only.
- "What's this pattern's hit rate?": step 4 only.
- "Re-render the HIMS chart I saw earlier": step 5 only, reusing
  earlier annotations.

## Tool errors

Every tool returns `{success: bool, data | error, meta}`. On
`success: false`, read `error` + `details`, explain what went
wrong in plain English to the user, and either correct the
arguments or fail gracefully. Never retry blindly.

Common errors + fixes:
- `422 Invalid request body` → argument mismatch, check the
  schema; fix and retry once.
- `404 <ticker> not found` → Supabase doesn't have this ticker's
  data cached yet. Surface honestly; don't hallucinate prices.
- `429 Rate limit exceeded` → back off, continue in plain text
  until the limit resets.
- `500` → internal service issue. Do not retry — surface to user.
```

### 3.3 Why the sequence matters

- **Facts before thesis** (1, 2 before 3, 4). A thesis built on
  invented numbers is worse than no thesis. Every internal reasoning
  step should cite a tool result.
- **Empirical backing before visualization** (3 before 4). Don't
  render a chart that says "HIGH CONVICTION" if you haven't checked
  the pattern's historical hit rate.
- **One pass, not a loop.** The tools are for grounding, not
  exploration. If OpenClaw enters a multi-iteration
  "call-tool-reason-call-tool-reason" loop on a single question,
  that's a signal the first pass was insufficiently planned —
  teach the system prompt to budget its calls up front.

### 3.4 Calls to avoid entirely

- **Tool-calling as a conversational filler.** "Let me check that
  for you" followed by a `get_price_history` the user didn't need.
  If the user asked "is HIMS at a Wave 2 setup?", they want the
  answer, not a price table.
- **Re-pulling unchanged data.** Fundamentals refresh ~quarterly;
  prices refresh daily. A second call for the same ticker + range
  in the same conversation almost always returns the same bytes.
- **Backtesting one-ticker cohorts.** The engine tolerates it but
  the output is statistically meaningless.
- **Rendering every thesis.** Charts are expensive (storage + human
  attention). Render when the structure is visually non-obvious; a
  simple "above 200MA, no Wave 2 yet" thesis doesn't need one.

### 3.5 Handing the output back to the user

OpenClaw's final reply to the user should:

- **Lead with the conclusion** (wave position, conviction, suggested
  next step), not with a recap of what tools you called.
- **Cite the tool results inline** when you state a number: "Revenue
  +14.7 % QoQ (get_fundamentals)" or "Wave 2 at 0.618 fib has a
  61 % hit rate at 6 months over 2015-2024 (backtest_pattern,
  n = 84)". The parenthetical keeps the source auditable without
  turning the reply into a tool log.
- **Embed the chart URL** if you rendered one. One image beats a
  paragraph describing what the image would show.
- **Be honest about missing data.** If a tool returned an error or
  sparse results, say so — don't paper over it.

---

## 4. Test prompt — end-to-end integration check

One prompt you give OpenClaw after the integration is live to confirm
every piece of the pipeline works: auth header reaches the quant
service, the four tools resolve and return data, OpenClaw reasons
over the results, and the final reply comes back with a chart URL
embedded.

### 4.1 The prompt

Paste this verbatim into OpenClaw's chat as a single user message:

```text
Analyze HIMS as a potential TLI Wave 2 setup. I want to know:

1. Current price context vs. the recent 2-year range.
2. Does the business fundamentally pass the TLI screen (revenue
   growth positive, FCF positive, margins not contracting, balance
   sheet healthy)?
3. Is there a backtested Wave 2 at 0.618 fib signal I can lean on
   — how often has that pattern worked historically?
4. If there's a setup, show me the chart with the wave labels,
   fib zone, and DCA tranche ladder annotated.

Answer in the order above. Cite tool results inline so I can audit
where each number came from.
```

### 4.2 Expected tool-call sequence

A well-behaved OpenClaw will make 3 or 4 tool calls, in this order,
with roughly these arguments. Deviations in arguments are fine —
**deviations in order or a radically different call count are the
signal something's off**.

| # | Tool | Approx. arguments |
| - | --- | --- |
| 1 | `get_price_history` | `{"ticker": "HIMS", "start": "<~2 years ago>", "end": "<today>"}` |
| 2 | `get_fundamentals` | `{"ticker": "HIMS"}` (no `metrics` filter — question asks about a full screen) |
| 3 | `backtest_pattern` | `{"pattern_name": "wave_2_at_618", "universe_spec": {"universe": "tracked_8500"}` (or `{"tickers": [<20+ liquid names>]}`)`, "date_range": {"start": "<~5-10y ago>", "end": "<today>"}, "horizons": [3, 6, 12, 24]}` |
| 4 | `render_tli_chart` | `{"ticker": "HIMS", "date_range": {...}, "annotations": {"wave_labels": [...], "fibonacci_levels": [...], "entry_tranches": [...], "caption": "..."}}` — **only if** OpenClaw concluded a valid setup in steps 1-3 |

Call #4 is conditionally skipped if OpenClaw honestly concludes HIMS
isn't in a Wave 2 setup right now — that's **correct behavior**, not
a failure. The §3 system prompt teaches this explicitly.

### 4.3 Expected final reply shape

OpenClaw should reply with roughly this structure (the exact prose
will vary — verify structure, not wording):

```text
[lead-in conclusion: e.g. "HIMS is / isn't in a Wave 2 setup right
now; conviction: <level>"]

1. Price context:
   Current close $<X>, 2-year range $<low>-$<high>, position <pct>% off
   recent high. (get_price_history)

2. Fundamental screen:
   Revenue <+/-X>% YoY, FCF <positive/negative>, gross margin
   <expanding/flat/contracting>, total debt / cash ratio <X>.
   TLI screen: <passes all 5 gates / fails at <gate>>. (get_fundamentals)

3. Historical backing:
   wave_2_at_618 over <window>, n=<signals>:
     3-mo hit rate <X>%  median +<Y>%
     6-mo hit rate <X>%  median +<Y>%
    12-mo hit rate <X>%  median +<Y>%
    24-mo hit rate <X>%  median +<Y>%
   (backtest_pattern)

4. Setup visualization:
   [Chart URL — https://<supabase-storage>/charts/HIMS/daily/<hash>.png]
   (render_tli_chart)

Overall: <final assessment + any caveats>.
```

Numbers in the sample above are placeholders — OpenClaw fills in
real values from the tool results. What matters:

- The **conclusion leads** (not a recap of tool calls).
- Each number is **cited inline** with the tool that produced it.
- The **chart URL is embedded**, not described.
- If any tool returned an error or missing data, that's **surfaced
  honestly** ("I couldn't pull fundamentals for HIMS — [reason]")
  rather than invented around.

### 4.4 Failure modes to watch for

Run the test prompt. If any of these happen, stop and investigate
before declaring the integration good.

| Symptom | Likely cause | Where to look |
| --- | --- | --- |
| OpenClaw calls no tools at all | System-prompt additions didn't land, or tools array didn't register. | Verify §2 `tools=[...]` was pasted into OpenClaw's request; verify §3 prompt block is in the active system prompt. |
| Every tool call returns `401 Invalid API key` | Wrong / rotated / missing bearer token in OpenClaw's client. | Check `QUANT_API_TOKEN` in OpenClaw's env; re-curl `/v1/tools` from OpenClaw's shell; confirm `is_active = true` in Supabase `api_keys`. |
| `403 Requires scope: quant:tools` | Key exists but scope array is wrong. | `update api_keys set scopes = ARRAY['quant:tools'] where name = 'OpenClaw';` |
| `get_price_history` returns `{"bars": []}` | HIMS isn't cached in `prices_daily` yet. | Either (a) run the ingestion CLI for HIMS, or (b) tell OpenClaw to re-call after a few seconds — the service falls through to OpenBB on miss and upserts, so the second call succeeds. |
| `get_fundamentals` returns sparse data | HIMS has been public < 4 quarters, or OpenBB rate-limited. | Sparse is expected for recent IPOs. Surface honestly. |
| `backtest_pattern` returns `n=0` at every horizon | Universe or window too narrow. | Check the `universe_spec` sent — should be `tracked_8500` or ≥ 20 tickers. A 10-year window is a realistic floor. |
| Hit rates implausibly extreme (< 10 % or > 90 %) | Universe is one ticker, or the pattern detector isn't firing. | §3 rule: don't backtest one-ticker cohorts. If universe is large and hit rate is still extreme, stop and inspect sample signals. |
| Chart URL returns 404 | Supabase Storage bucket `tli-charts` not public-read, or the render service isn't deployed. | `supabase storage get-bucket tli-charts` — confirm `public = true`. |
| Chart renders but annotations missing | OpenClaw passed `annotations: {}` (empty). | §3 teaches to compose annotations before calling; check OpenClaw's reasoning log. |
| OpenClaw calls the same tool twice in a row with identical args | System prompt §3 not followed. | The compact-version block's rule "don't re-call" is the mitigation — reinforce in the prompt. |
| OpenClaw fabricates price levels or hit rates after a tool failure | Tool error handling in OpenClaw's adapter not surfacing errors back to the model. | §2.2 (response envelope) explains the expected adapter behavior — on `success:false`, surface `error` + `details` as a tool-error so the model self-corrects. |
| Tool calls work but final reply is a wall of tool logs | System prompt §3.5 ("hand output back to the user") not followed. | Tighten the prompt to lead with conclusion, not recap. |
| Total prompt latency > 30 s | Likely a `backtest_pattern` on `tracked_8500` × 10 years hitting the sync watchdog. | Service has an async path (`?async=true` returns a `job_id`); OpenClaw's client should either tolerate slower sync or implement the polling flow. Start with sync; upgrade only if p95 crosses 10 s. |

### 4.5 Pass criteria

The integration passes the smoke test when **all** of:

1. OpenClaw emits 3 or 4 tool calls in the order above.
2. Every tool call returns `success: true` (or a surfaced-honestly
   failure with a stated reason).
3. The final reply contains a numeric answer for each of the four
   questions in the prompt.
4. Cited numbers inline reference the tool that produced them.
5. If the setup is valid, a chart URL is embedded and clickable
   returns a PNG.
6. Total wall time is under 15 s.

If all six hold, the four green tools are production-ready against
OpenClaw. If any fail, surface the failure before proceeding to the
simulate_strategy integration conversation.

---

**Integration plan complete. Next checkpoints:**

1. Run the Step 1 Railway egress check (branch
   `claude/stage4.5-railway-egress-check`) to unblock
   `simulate_strategy`.
2. Run the Step 2 real-data verification
   (`docs/real-data-verification.md`) to confirm the `backtest_pattern`
   numbers stand up against 2010-2020 real prices.
3. Mint the OpenClaw key per §1, paste §2 and §3 into OpenClaw's
   config, run §4's test prompt, and iterate from there.
