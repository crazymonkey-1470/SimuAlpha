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

**Sections 2–4 (tool schemas, system-prompt additions, test prompt)
pending in separate commits.**
