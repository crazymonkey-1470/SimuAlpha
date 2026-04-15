# Deploying SimuAlpha to Railway

This document describes the steps a human operator needs to perform to deploy
the monorepo to Railway. The code in this branch is deploy-ready; what remains
are actions that require Railway credentials and a browser.

## Current status

- **This branch (`claude/clone-simu-alpha-AsDGT`)**: deploy-ready. Root
  `package.json`, static SPA serving, health check, graceful shutdown, and
  idempotent migrations are all wired up.
- **`main` branch**: Railway's auto-deploy watches `main`. Nothing will ship
  to production until this branch is merged.

## What the repo already provides

| Concern | How it's handled |
|---|---|
| Frontend build | `npm run build:all` at repo root builds `frontend/dist/` |
| Static serving | Backend serves `frontend/dist/` with SPA fallback (only if the dir exists) |
| DB migrations | `backend/services/database.js` runs `backend/migrations/*.sql` on startup, tracked in `_migrations` table, each file in its own txn |
| Graceful shutdown | `SIGTERM`/`SIGINT` drain connections, close pg pool, hard-exit after 10s |
| Health check | `GET /health` returns component-level status; always 200 |
| Missing DATABASE_URL | Gracefully degrades — logs warning, supabase-js CRUD still works, raw-SQL paths no-op |
| Admin auth | `x-admin-key` header required by `/api/tier/learning/*` admin endpoints |

## Operator checklist

### 1. Merge this branch to `main`

Open a PR from `claude/clone-simu-alpha-AsDGT` → `main` and merge it. The rest
of this checklist assumes you've done so.

### 2. Set environment variables in Railway

In the Railway project → **Variables** tab, set (values in `.env.example` are
placeholders):

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | yes | Set to `production` |
| `PORT` | no | Railway injects this automatically |
| `FRONTEND_URL` | yes | `https://simualpha.com` — used for CORS |
| `DATABASE_URL` | yes | Supabase **pooled** (:6543) Postgres URL |
| `DATABASE_MIGRATE_URL` | recommended | Supabase **direct** (:5432) URL for migrations |
| `SUPABASE_URL` | yes | Existing services/supabase.js expects this |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service-role key for server-side writes |
| `ADMIN_API_KEY` | yes | Random 32-char hex (`openssl rand -hex 32`) |
| `RESEND_API_KEY` | yes | From resend.com dashboard |
| `ANTHROPIC_API_KEY` | optional | Only needed if AI features are active |
| `X_BEARER_TOKEN` | optional | Only needed for SAIN social scanner |
| `POLYGON_API_KEY` | optional | Only needed if backend calls Polygon directly |
| `SCRAPER_URL` | optional | If scraper is a separate Railway service |

**Do not commit any of these to git.** `.env` is gitignored.

### 3. Configure Railway build/deploy

`railway.json` at the repo root already declares:

```json
{
  "build":  { "builder": "NIXPACKS", "buildCommand": "npm run build:all" },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

In the Railway service settings, confirm:

- **Root Directory**: `/` (monorepo root — NOT `backend/`)
- **Watch Paths** (optional): leave default, or restrict to `backend/**`,
  `frontend/**`, `railway.json`, `package.json`
- **GitHub integration**: connected to `crazymonkey-1470/SimuAlpha`, branch
  `main`, auto-deploy **enabled**

### 4. First deploy

Push to `main` (or click "Deploy" in Railway). The build will:

1. Run `npm install` at root (no deps, nearly instant).
2. Run `npm run build:all` which runs `npm ci` in both `backend/` and
   `frontend/`, then `vite build`.
3. Start via `npm start` → `node backend/server.js`.

On startup, server logs should show (in order):

```
applying migration  001_backtest_runs.sql
applying migration  002_signal_outcomes.sql
... through 006 ...
migrations complete { applied: 6, skipped: 0 }
serving SPA from frontend/dist
The Long Screener backend listening { port: 3000 }
```

If `DATABASE_MIGRATE_URL` / `DATABASE_URL` are missing, you'll instead see:

```
DATABASE_URL not set — skipping migrations.
Database not configured — continuing without migrations
```

— server still starts, but admin endpoints won't work until the URLs are set.

### 5. Smoke tests against the live URL

Replace `$HOST` with the Railway-generated URL (or `https://simualpha.com`):

```bash
# Liveness
curl -s $HOST/health | jq .

# Public TIER endpoints (no auth)
curl -s $HOST/api/tier/backtest/summary       | jq .
curl -s $HOST/api/tier/learning/principles    | jq .
curl -s $HOST/api/tier/waitlist/count         | jq .

# Waitlist signup (real write)
curl -s -X POST $HOST/api/tier/waitlist/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoketest+$(date +%s)@example.com","source":"deploy-check"}' | jq .

# Admin endpoint (needs ADMIN_API_KEY)
curl -s $HOST/api/tier/learning/pending \
  -H "x-admin-key: $ADMIN_API_KEY" | jq .

# Frontend routes
curl -sI $HOST/        | head -1    # → 200
curl -sI $HOST/admin   | head -1    # → 200 (SPA fallback)
```

Expected behaviors:

- On an empty database, `/backtest/summary` returns `{total_runs: 0, by_tier: {}}`
  — not an error.
- `/waitlist/signup` with the same email twice returns `success: true` both
  times (duplicate is tolerated via PG unique violation code `23505`).
- `/admin` in a browser should render the password gate; submitting the admin
  key should load the dashboard.

### 6. Email delivery (post-deploy)

Resend requires verifying the sending domain. Once `RESEND_API_KEY` is set and
`simualpha.com` is verified in the Resend dashboard, welcome emails will send
on waitlist signup. Every attempt (sent or failed) is recorded in the
`email_log` table for audit.

### 7. Rollback

- **App rollback**: Railway → service → Deployments → pick the previous
  successful deployment → "Rollback to this deployment".
- **Schema rollback**: migrations are purely additive (`CREATE TABLE IF NOT
  EXISTS`). No down-migration is required for the current set. To drop the
  new tables manually, run in the Supabase SQL editor:

  ```sql
  DROP TABLE IF EXISTS waitlist, email_log, learned_principles,
    weight_adjustment_queue, signal_outcomes, backtest_runs, _migrations CASCADE;
  ```

  Only do this if you explicitly want to wipe data.

## What I (Claude) did NOT do

Because these require Railway credentials or affect production:

- Did not push to `main`.
- Did not set any Railway environment variables.
- Did not trigger a Railway deployment.
- Did not hit the live simualpha.com endpoints.
- Did not modify DNS.

Those steps are listed above for the operator.
