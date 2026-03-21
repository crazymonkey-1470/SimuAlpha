# SimuAlpha — Deployment & Integration Guide

## Architecture Overview

```
┌─────────────────────┐     ┌─────────────────────┐     ┌──────────────┐
│   Frontend (Next.js)│────▶│   Backend (FastAPI)  │────▶│   Database   │
│   Cloudflare Pages  │     │   Railway             │     │   Supabase   │
│   apps/web          │     │   apps/api            │     │   PostgreSQL │
└─────────────────────┘     └─────────────────────┘     └──────────────┘
        ▲                            ▲
        │                            │
  Your domain              NEXT_PUBLIC_API_URL
  (e.g. simualpha.com)    (e.g. api.simualpha.com)
```

---

## API Endpoints to Connect

The frontend calls **10 backend endpoints**. All are `GET` requests except one.

### Core Data Endpoints (consumed by frontend)

| Frontend Call | Backend Endpoint | Used On | Purpose |
|---|---|---|---|
| `api.regime.current()` | `GET /api/v1/regime/current` | Dashboard, Regime | Current regime classification, confidence, pressure, drivers |
| `api.regime.history()` | `GET /api/v1/regime/history` | Regime | Historical regime timeline |
| `api.actors.current()` | `GET /api/v1/actors/current` | Dashboard, Actors | All 7 actor classes with bias, conviction, contribution |
| `api.scenarios.current()` | `GET /api/v1/scenarios/current` | Dashboard, Scenarios | Scenario branches with probabilities and reactions |
| `api.signals.current()` | `GET /api/v1/signals/current` | Dashboard, Signals | Current signal output with posture guidance |
| `api.signals.history()` | `GET /api/v1/signals/history` | Signals | Historical signal entries |
| `api.context.crossAsset()` | `GET /api/v1/context/cross-asset` | Dashboard | Cross-asset prices, vol states, trends |
| `api.replay.frame(date)` | `GET /api/v1/replay/{date}` | Replay | Historical simulation snapshot for a given date |
| `api.system.status()` | `GET /api/v1/system/status` | System | API health, data freshness, model version |

### Backend-Only Endpoints (not called by frontend yet)

| Endpoint | Purpose | Notes |
|---|---|---|
| `GET /api/v1/health` | Health check | Used by Railway for uptime monitoring |
| `POST /api/v1/simulation/run` | Trigger a simulation run | Admin/worker use; wire to frontend later if needed |

### Connection Flow

```
Frontend (browser)
    │
    │  fetch("https://simualphaapi-production.up.railway.app/api/v1/regime/current")
    │
    ▼
Backend (Railway)
    │
    │  Reads from Supabase or returns seed/computed data
    │
    ▼
Database (Supabase)
```

The frontend API client lives at `apps/web/src/lib/api.ts`. It reads `NEXT_PUBLIC_API_URL` and falls back to mock data if the backend is unreachable.

---

## Step-by-Step: Going Live

### 1. Set Up Supabase (Database)

1. Create a project at [supabase.com](https://supabase.com)
2. Note your **project URL** and **service role key**
3. The backend will need these as environment variables:
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_KEY=eyJ...
   DATABASE_URL=postgresql://postgres:password@db.xxxx.supabase.co:5432/postgres
   ```

### 2. Deploy Backend on Railway

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Point it to this repo, set the **root directory** to `apps/api`
3. Set these **environment variables** in Railway:
   ```
   SUPABASE_URL=<from step 1>
   SUPABASE_SERVICE_KEY=<from step 1>
   DATABASE_URL=<from step 1>
   ```
4. Railway will auto-detect the Python app. Ensure the start command is:
   ```
   uvicorn app.main:app --host 0.0.0.0 --port $PORT
   ```
5. Once deployed, your URL is: `https://simualphaapi-production.up.railway.app`
6. **Custom domain (recommended):** In Railway settings, add `api.simualpha.com` (or whatever your domain is) and configure DNS (see step 5)

### 3. Deploy Frontend on Cloudflare Pages

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages → Create a project
2. Connect your GitHub repo
3. Configure build settings:
   ```
   Framework preset:  Next.js
   Root directory:    apps/web
   Build command:     npx turbo build --filter=@simualpha/web
   Build output:      apps/web/.next
   ```
   > **Note:** You may need to use `@cloudflare/next-on-pages` for full compatibility. See [Cloudflare Next.js docs](https://developers.cloudflare.com/pages/framework-guides/nextjs/).
4. Set this **environment variable** in Cloudflare Pages:
   ```
   NEXT_PUBLIC_API_URL=https://simualphaapi-production.up.railway.app
   ```
   (Use whatever URL your Railway backend is at)
5. Deploy. You'll get a URL like `https://simualpha.pages.dev`

### 4. Purchase & Configure Your Domain

1. Buy a domain (e.g. `simualpha.com`) from any registrar
2. Transfer DNS to Cloudflare (recommended — free, and your frontend is already there)
3. Set up DNS records:

   | Type | Name | Target | Proxy |
   |------|------|--------|-------|
   | CNAME | `@` | `simualpha.pages.dev` | Proxied |
   | CNAME | `www` | `simualpha.pages.dev` | Proxied |
   | CNAME | `api` | `simualphaapi-production.up.railway.app` | DNS only |

4. In Cloudflare Pages → Custom domains → Add `simualpha.com` and `www.simualpha.com`
5. In Railway → Settings → Custom domain → Add `api.simualpha.com`
6. SSL is automatic on both platforms

### 5. Verify Everything Works

```bash
# Check backend health
curl https://simualphaapi-production.up.railway.app/api/v1/health

# Check a data endpoint
curl https://simualphaapi-production.up.railway.app/api/v1/regime/current

# Visit frontend
open https://simualpha.com
```

---

## Environment Variables Summary

### Backend (Railway)

| Variable | Example | Required |
|---|---|---|
| `SUPABASE_URL` | `https://xxxx.supabase.co` | Yes |
| `SUPABASE_SERVICE_KEY` | `eyJ...` | Yes |
| `DATABASE_URL` | `postgresql://...` | Yes |

### Frontend (Cloudflare Pages)

| Variable | Example | Required |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://simualphaapi-production.up.railway.app` | Yes |

---

## What Needs Work Before Production

| Item | Status | Notes |
|---|---|---|
| Backend seed data → real database | Needed | Currently returns hardcoded seed data |
| Simulation engine | Needed | The `POST /api/v1/simulation/run` endpoint exists but needs real logic |
| Database migrations | Needed | Schema tables for regime, actors, scenarios, signals, replay |
| Auth (if needed) | Optional | No auth currently; add if multi-user access is needed |
| CORS configuration | Check | Backend must allow requests from your frontend domain |
| Rate limiting | Recommended | Protect API from abuse |
| Caching | Recommended | Regime/signal data doesn't change every second; cache for 1-5 min |

---

## File Map

```
apps/
├── api/                          # FastAPI backend (→ Railway)
│   └── app/
│       ├── main.py               # App entry point
│       ├── api/
│       │   ├── router.py         # Route aggregator
│       │   └── routes/           # All endpoint handlers
│       ├── schemas/              # Pydantic response models
│       └── data/seed.py          # Mock data (replace with DB reads)
│
└── web/                          # Next.js frontend (→ Cloudflare)
    └── src/
        ├── app/                  # Pages (routes)
        │   ├── page.tsx          # / (Dashboard)
        │   ├── regime/           # /regime
        │   ├── actors/           # /actors
        │   ├── scenarios/        # /scenarios
        │   ├── signals/          # /signals
        │   ├── replay/           # /replay
        │   └── system/           # /system
        ├── components/           # React components
        │   ├── layout/           # Sidebar, Topbar
        │   ├── ui/               # Card, Badge, ConfidenceBar, etc.
        │   └── dashboard/        # Dashboard-specific composites
        └── lib/
            ├── api.ts            # API client (set NEXT_PUBLIC_API_URL)
            ├── types.ts          # TypeScript interfaces
            ├── mock-data.ts      # Fallback data when backend offline
            └── utils.ts          # Helpers
```
