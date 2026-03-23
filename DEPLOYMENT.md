# SimuAlpha — Deployment Guide

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐     ┌──────────────┐
│   Frontend (Next.js)│────▶│   Backend (FastAPI)  │────▶│   Database   │
│   Cloudflare Pages  │     │   Railway             │     │   Supabase   │
│   simualpha.com     │     │   api.simualpha.com   │     │   PostgreSQL │
└─────────────────────┘     └─────────────────────┘     └──────────────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │    Redis     │
                              │  (optional)  │
                              │  Job Queue   │
                              └──────────────┘
```

---

## Environment Variables

### Backend (Railway)

| Variable | Description | Required |
|---|---|---|
| `SIMUALPHA_DATABASE_URL` | PostgreSQL connection string (Supabase) | Yes |
| `SIMUALPHA_JWT_SECRET` | Random 64+ char string for JWT signing | Yes |
| `SIMUALPHA_REDIS_URL` | Redis URL for job queue | No (queue features disabled without it) |
| `SIMUALPHA_USE_REAL_DATA` | `true` to use Yahoo Finance data | No (default: `false` = synthetic) |
| `SIMUALPHA_CORS_ORIGINS` | JSON array of allowed origins | No (defaults include simualpha.com) |
| `SIMUALPHA_DEBUG` | `true` for verbose logging | No (default: `false`) |
| `SIMUALPHA_SIM_CACHE_TTL` | Engine cache TTL in seconds | No (default: `300`) |
| `PORT` | Server port (Railway sets this) | Auto |

### Frontend (Cloudflare Pages)

| Variable | Description | Required |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API URL | Yes |

---

## Deploy Steps

### 1. Supabase (Database)

Already configured. The database schema is managed via Alembic migrations that run automatically on API startup.

### 2. Railway (Backend API)

Railway deploys from the repo root using `apps/api/Dockerfile`.

**Required env vars in Railway dashboard:**
```
SIMUALPHA_DATABASE_URL=postgresql://postgres:<password>@db.<project>.supabase.co:5432/postgres
SIMUALPHA_JWT_SECRET=<generate with: python -c "import secrets; print(secrets.token_urlsafe(64))">
SIMUALPHA_USE_REAL_DATA=true
SIMUALPHA_CORS_ORIGINS=["https://simualpha.com","https://www.simualpha.com","https://simualpha.pages.dev"]
```

**What happens on startup (`start.sh`):**
1. Runs `alembic upgrade head` (creates/updates all 15+ tables)
2. Checks if simulation data exists; if empty, runs initial seed simulation
3. Starts uvicorn

**Custom domain:** Add `api.simualpha.com` in Railway settings, configure DNS CNAME.

### 3. Cloudflare Pages (Frontend)

Build settings:
```
Framework:     Next.js (Static HTML Export)
Root:          apps/web
Build command: cd ../.. && npx pnpm install && npx pnpm --filter @simualpha/web build
Output:        apps/web/out
```

Environment variable:
```
NEXT_PUBLIC_API_URL=https://simualphaapi-production.up.railway.app
```

Custom domains: `simualpha.com` and `www.simualpha.com` in Cloudflare Pages settings.

### 4. DNS Records

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `@` | `simualpha.pages.dev` | Proxied |
| CNAME | `www` | `simualpha.pages.dev` | Proxied |
| CNAME | `api` | `simualphaapi-production.up.railway.app` | DNS only |

---

## Verify

```bash
# Health check
curl https://simualphaapi-production.up.railway.app/api/v1/health

# Regime data
curl https://simualphaapi-production.up.railway.app/api/v1/regime/current

# Auth
curl -X POST https://simualphaapi-production.up.railway.app/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123","full_name":"Test User"}'
```

---

## Optional: Redis (Job Queue)

Add a Redis service on Railway for async job processing:
```
SIMUALPHA_REDIS_URL=redis://<railway-redis-host>:6379
```

Without Redis, all simulations run synchronously via the API. With Redis, you can:
- Queue simulation/replay/calibration jobs
- Run background workers
- Schedule periodic data refreshes
