# The Long Screener

A stock opportunity finder implementing **The Long Investor (TLI) methodology**: buying fundamentally AND technically undervalued positions at or below the 200 WMA/200 MMA.

## TLI Methodology

Stocks are scored 0–100 based on two pillars:

**Fundamental Score (50 pts):** Revenue growth, distance from 52-week high, P/S ratio, P/E ratio.

**Technical Score (50 pts):** Price position relative to 200 Weekly Moving Average and 200 Monthly Moving Average.

| Signal | Score | Action |
|---|---|---|
| LOAD THE BOAT | 75–100 | Full position — fundamental + technical sweet spot |
| ACCUMULATE | 60–74 | Dollar-cost average in |
| WATCH | 0–59 | Monitor for improvement |

## Architecture

```
Railway (backend/)           Supabase (DB)           Cloudflare Pages (frontend/)
┌──────────────┐       ┌──────────────────┐       ┌────────────────────┐
│ Cron: 6 hrs  │──────▶│ screener_results │◀──────│ Dashboard          │
│ Yahoo Finance│       │ watchlist         │◀─────▶│ Screener           │
│ FMP API      │       │ scan_history      │       │ Deep Dive          │
│ TLI Scorer   │       └──────────────────┘       │ Watchlist           │
└──────────────┘                                   └────────────────────┘
     WRITES                                              READS
```

**Railway and the frontend never communicate directly.** No CORS config needed.

- Railway writes scored data to Supabase using the **service role key**
- Frontend reads from Supabase using the **anon key**
- Frontend writes to the watchlist table only

## Monorepo Structure

```
/
├── backend/          ← Express + cron (Railway)
│   ├── server.js     ← Health check + starts cron
│   ├── cron.js       ← 6-hour scan scheduler
│   ├── fetcher.js    ← Yahoo Finance + FMP data fetching
│   ├── scorer.js     ← TLI scoring algorithm
│   ├── supabase.js   ← Supabase client (service role)
│   ├── tickers.js    ← Default ticker list (30 stocks)
│   └── nixpacks.toml ← Railway build config
├── frontend/         ← React + Vite (Cloudflare Pages)
│   ├── src/
│   │   ├── supabaseClient.js  ← Supabase client (anon key)
│   │   ├── pages/
│   │   └── components/
│   └── vite.config.js
└── supabase/
    └── migration.sql ← Full schema
```

## Environment Variables

### Backend (Railway)
| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (NOT the anon key) |
| `FMP_API_KEY` | Financial Modeling Prep API key (free tier) |
| `PORT` | Server port (default: 3000) |

### Frontend (Cloudflare Pages)
| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |

## Setup

### 1. Supabase
1. Create a new Supabase project
2. Go to SQL Editor
3. Paste and run the contents of `supabase/migration.sql`
4. Copy your project URL, anon key, and service role key from Settings > API

### 2. Railway (Backend)
1. Create a new Railway project
2. Connect this GitHub repo
3. Set **Root Directory** to `backend`
4. Set **Build Command** to `npm install`
5. Set **Start Command** to `node server.js`
6. Set **Health Check Path** to `/health`
7. Add environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FMP_API_KEY`
8. Deploy — the first scan runs immediately on startup

### 3. Cloudflare Pages (Frontend)
1. Create a new Cloudflare Pages project
2. Connect this GitHub repo
3. Set **Root Directory** to `frontend`
4. Set **Build Command** to `npm run build`
5. Set **Build Output Directory** to `dist`
6. Add environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
7. Deploy

## Adding More Tickers

Edit `backend/tickers.js` and add/remove ticker symbols from the array. Changes take effect on the next Railway deploy or cron cycle.

## Data Sources

- **Yahoo Finance** (`yahoo-finance2`): Current price, historical prices (weekly/monthly), 52-week high
- **Financial Modeling Prep** (free tier): Revenue history, P/E ratio, P/S ratio, sector

---

*Not financial advice. For educational and informational purposes only.*
