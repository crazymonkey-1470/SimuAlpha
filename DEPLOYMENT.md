# SimuAlpha — Deployment Guide

## Architecture

```
Frontend (Next.js) → Backend API (FastAPI) → Database (Supabase PostgreSQL)
```

## Railway Services

### Recommended Setup (2 services)

| Service | Type | Notes |
|---------|------|-------|
| **SimuAlpha API** | Railway Python | FastAPI backend, port 8000 |
| **SimuAlpha Web** | Railway Node / Cloudflare Pages | Next.js frontend, port 3000 |

### Removed Services

- **Worker**: No longer needed. Analysis runs synchronously in the API.
- **Scheduler**: No longer needed. No background job queue required.
- **Redis**: No longer needed. No job queue dependency.

### Why This Is Simpler

The old SimuAlpha had a simulation engine requiring background workers, Redis queues, and scheduled tasks. The new distress-analysis product runs analysis on-demand within the API request, caches results in PostgreSQL, and serves them directly.

## Environment Variables

### API Service (Railway)

```
SIMUALPHA_DATABASE_URL=postgresql://...  (Supabase connection string)
SIMUALPHA_JWT_SECRET=<64+ char random string>
SIMUALPHA_CORS_ORIGINS=["https://simualpha.com","https://www.simualpha.com"]
SIMUALPHA_FINANCIAL_DATA_API_KEY=<optional - for live data provider>
SIMUALPHA_REPORT_CACHE_TTL=21600
```

### Frontend Service

```
NEXT_PUBLIC_API_URL=https://api.simualpha.com
```

## Database Setup

1. Create a Supabase project
2. Run `supabase_migration.sql` in the SQL editor
3. Set `SIMUALPHA_DATABASE_URL` to the Supabase connection string

## Build & Deploy

### API (Railway)
- Build command: `pip install .`
- Start command: `sh start.sh`
- start.sh runs Alembic migrations then starts uvicorn

### Frontend (Cloudflare Pages or Railway)
- Build command: `pnpm install && pnpm build:web`
- Start command: `pnpm start` (runs `next start`)
- Output directory: `apps/web/.next`
