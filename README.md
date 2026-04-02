# The Long Screener

An autonomous stock discovery engine implementing **The Long Investor (TLI) methodology** — scanning the entire US market to find fundamentally and technically undervalued positions at key moving average support zones, with real-time Telegram alerts.

## What This Does

This is not a dashboard for a hardcoded watchlist. This is a **discovery engine** that:

1. **Scans ~8,000 NYSE + NASDAQ stocks** daily (Stage 1)
2. **Filters to ~200-400 candidates** using revenue growth, drawdown, and market cap (Stage 2)
3. **Deep-scores candidates** using the TLI algorithm against 200 WMA/MMA (Stage 3, every 6 hours)
4. **Fires Telegram alerts** when new entry opportunities emerge or signals upgrade
5. **Tracks score changes** over time to detect momentum shifts

## TLI Methodology

**Fundamental Score (50 pts):** Revenue growth (15), 52-week drawdown (15), P/S ratio (10), P/E ratio (10)

**Technical Score (50 pts):** Distance from 200 Weekly MA (25), Distance from 200 Monthly MA (25)

| Signal | Score | Meaning |
|---|---|---|
| LOAD THE BOAT | 75–100 | Fundamental + technical sweet spot |
| ACCUMULATE | 60–74 | Dollar-cost average zone |
| WATCH | 40–59 | Monitor for improvement |
| PASS | <40 | Filtered out |

**Entry Zone:** Active when price is within 3% of (or below) the 200 WMA or 200 MMA.

## Architecture

```
┌─ Railway (backend/) ─────────────┐       ┌─ Supabase ──────────────┐       ┌─ Cloudflare Pages ─────┐
│                                   │       │                         │       │                        │
│  Stage 1: Universe (midnight)     │──────▶│  universe               │       │  Dashboard             │
│  Stage 2: Prescreen (12:30am)     │──────▶│  screener_candidates    │◀──────│  Screener              │
│  Stage 3: Deep Score (every 6h)   │──────▶│  screener_results       │◀──────│  Deep Dive             │
│  Telegram Alerts                  │──────▶│  signal_alerts          │◀──────│  Signals               │
│                                   │       │  watchlist              │◀─────▶│  Watchlist              │
│  GET /health only                 │       │  scan_history           │◀──────│                        │
└───────────────────────────────────┘       └─────────────────────────┘       └────────────────────────┘
         WRITES (service role)                   Single source of truth              READS (anon key)
```

**Railway and the frontend never communicate.** No CORS needed.

## Monorepo Structure

```
/
├── backend/
│   ├── server.js          ← Health check + starts cron + initial pipeline
│   ├── cron.js            ← Schedules all 3 stages
│   ├── nixpacks.toml      ← Railway build config
│   ├── pipeline/
│   │   ├── stage1_universe.js    ← FMP stock list → filter → universe table
│   │   ├── stage2_prescreen.js   ← Lightweight filters → candidates table
│   │   └── stage3_deepscore.js   ← Full TLI scoring → results + alerts
│   └── services/
│       ├── fetcher.js     ← Yahoo Finance + FMP data fetching
│       ├── scorer.js      ← TLI scoring algorithm + entry zone logic
│       ├── alerts.js      ← Telegram alert formatting + sending
│       └── supabase.js    ← Supabase client (service role key)
├── frontend/
│   ├── src/
│   │   ├── supabaseClient.js    ← Supabase client (anon key)
│   │   ├── pages/               ← Dashboard, Screener, DeepDive, Signals, Watchlist
│   │   └── components/          ← ScoreRing, SignalBadge, ScreenerTable, AlertFeed, etc.
│   └── vite.config.js
└── supabase/
    └── migration.sql      ← Full schema with RLS policies
```

## Environment Variables

### Backend (set in Railway dashboard)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (NOT anon key) — bypasses RLS |
| `FMP_API_KEY` | Financial Modeling Prep API key (free tier) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Chat ID to receive alerts |
| `PORT` | Server port (default: 3000) |

### Frontend (set in Cloudflare Pages dashboard)

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |

## Setup

### 1. Supabase

1. Create a new Supabase project
2. Go to **SQL Editor**
3. Paste and run the full contents of `supabase/migration.sql`
4. Copy your **project URL**, **anon key**, and **service role key** from Settings > API

### 2. Railway (Backend)

1. New service → connect this GitHub repo
2. **Root Directory:** `backend`
3. **Build Command:** `npm install`
4. **Start Command:** `node server.js`
5. **Health Check Path:** `/health`
6. Add all backend env variables
7. Deploy — the full pipeline runs immediately on startup

### 3. Cloudflare Pages (Frontend)

1. New project → connect this repo
2. **Root Directory:** `frontend`
3. **Build Command:** `npm run build`
4. **Build Output:** `dist`
5. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
6. Deploy

### 4. Telegram Bot

1. Message **@BotFather** on Telegram → `/newbot` → get the token
2. Start a chat with your bot (or add it to a group)
3. Get your chat ID: visit `https://api.telegram.org/bot<TOKEN>/getUpdates` after sending a message
4. Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` to Railway env vars

## Pipeline Stages

| Stage | Schedule | What it does | Output |
|---|---|---|---|
| 1 — Universe | Midnight daily | Fetches all NYSE+NASDAQ from FMP, filters to investable | ~3,000 stocks in `universe` |
| 2 — Prescreen | 12:30am daily | Revenue growth >0%, 20%+ below 52w high, market cap >$1B | ~200-400 in `screener_candidates` |
| 3 — Deep Score | Every 6 hours | Full TLI scoring with 200WMA/MMA, signal detection, alerts | Scored results + Telegram alerts |

## Scoring Algorithm

### Fundamental (50 pts)
- Revenue Growth: ≥20%=15, ≥10%=10, >0%=5
- 52w Drawdown: ≥60%=15, ≥40%=12, ≥25%=8, ≥15%=4
- P/S: <1=10, <3=7, <5=4, <10=2
- P/E: <10=10, <15=7, <20=4, <30=2

### Technical (50 pts)
- vs 200 WMA: at/below=25, ≤3%=20, ≤8%=12, ≤15%=5
- vs 200 MMA: at/below=25, ≤3%=20, ≤8%=12, ≤15%=5

### Alert Types
- **LOAD_THE_BOAT** — stock reached 75+ score for first time
- **SIGNAL_UPGRADE** — signal improved (e.g., WATCH → ACCUMULATE)
- **CROSSED_200WMA** — price crossed below 200 Weekly MA
- **CROSSED_200MMA** — price crossed below 200 Monthly MA

## Data Sources

- **Yahoo Finance** (`yahoo-finance2`): Current price, 52-week high, weekly/monthly historical prices
- **Financial Modeling Prep** (free tier): Full stock list, revenue, P/E, P/S, sector, market cap

---

*Not financial advice. For educational and informational purposes only. Do your own research.*
