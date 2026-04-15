# SimuAlpha — AI-Powered Stock Discovery Engine

> The most comprehensive stock discovery platform for retail investors. Combines The Long Investor (TLI) methodology, 8 super investor tracking, AI-driven thesis generation, politician trade monitoring, and a self-improving scoring engine — all in one system.

## What SimuAlpha Does

SimuAlpha autonomously scans the **S&P 500** (the 500 largest US companies) twice per week, filtering them through a multi-layered scoring algorithm that combines fundamental analysis (revenue growth, FCF, moat classification, balance sheet strength), technical analysis (200 Weekly/Monthly Moving Averages, Elliott Wave detection, Fibonacci confluence zones), and institutional intelligence from 8 tracked super investors. Every candidate that passes gets a TLI score from 0-100 with a clear signal: LOAD THE BOAT, ACCUMULATE, WATCH, or PASS.

On top of the core scoring engine sits an **Agentic Intelligence System** powered by Claude. A library of 14 AI skills generates full investment theses, classifies moats, detects value traps, interprets Elliott Wave patterns, and compares stock profiles against the frameworks of Buffett, Cohen, and Laffont. The system learns from its own outcomes — extracting principles from signal accuracy data and proposing weight adjustments with safety guardrails.

The **SAIN (Social & Alternative Intelligence Network)** layer monitors 19+ real-time sources across X accounts, politician trade trackers, AI model portfolios, and insider trade feeds. A 4-layer consensus engine scores every ticker across super investors, politicians, AI models, and TLI — when all four layers align, a **FULL_STACK_CONSENSUS** signal fires, the highest-conviction indicator in the system.

## Architecture

```
┌─ Railway: Backend (Node.js) ─────────────────────────────────────────────────────────────┐
│                                                                                           │
│  Pipeline: Universe → Prescreen → Deep Score → Wave Count → Valuations                   │
│  Scoring:  TLI v2 algorithm + bonus/penalty system + SAIN consensus                      │
│  Skills:   14 AI skills (thesis, moat, wave, macro, learning, social)                    │
│  Cron:     Pipeline 2x/week, SAIN social 6hr, politicians 12hr, consensus 12hr           │
│  API:      45+ endpoints (analysis, knowledge, skills, SAIN, learning, admin)             │
│                                                                                           │
├─ Railway: Scraper (Python FastAPI) ──────────────────────────────────────────────────────┤
│                                                                                           │
│  Polygon.io:  Prices, fundamentals, historical data                                      │
│  SEC EDGAR:   13F filings for 8 super investors                                          │
│  Computed:    Beta vs SPY, 5yr EV multiples                                              │
│                                                                                           │
├─ Cloudflare Pages (React/Vite/Tailwind/Framer Motion) ──────────────────────────────────┤
│                                                                                           │
│  Dashboard:  Market risk, top signals, consensus summary                                 │
│  Screener:   Sortable/filterable stock table with score rings                            │
│  Deep Dive:  Thesis display, valuation, wave charts, investor verdicts                   │
│  Signals:    Alert feed with upgrade/downgrade tracking                                  │
│                                                                                           │
├─ Supabase (PostgreSQL) ─────────────────────────────────────────────────────────────────┤
│                                                                                           │
│  26 tables: screener_results, signal_alerts, consensus_signals, knowledge_chunks,        │
│             stock_analysis, sain_sources, sain_signals, sain_consensus, ...               │
│  Knowledge base: tsvector full-text search + metadata array overlap (no vector embeddings)│
│  RLS policies on all tables                                                               │
│                                                                                           │
├─ External APIs ─────────────────────────────────────────────────────────────────────────┤
│                                                                                           │
│  Claude API (Haiku + Sonnet) — ALL AI: thesis, wave, moat, signal extraction             │
│  X API v2 — SAIN social scanning                                                         │
│  Polygon.io — Market data                                                                │
│  QuiverQuant — Politician trade data                                                     │
│                                                                                           │
└──────────────────────────────────────────────────────────────────────────────────────────┘
         Backend WRITES (service role key)                    Frontend READS (anon key)
```

**Zero external AI dependencies beyond Claude.** One API bill, full control.

## The Intelligence Stack

### Layer 1: TLI Scoring Engine (Sprints 1-7)

The core pipeline runs in stages:

1. **Universe Fetch** — Seeds ~500 S&P 500 constituents (full US market — 8,500+ tickers — planned for a future release)
2. **Fundamental Prescreen** — Filters to 200-400 candidates (revenue growth >0%, 20%+ drawdown, market cap >$1B)
3. **Deep Score** — Full TLI v2 algorithm with fundamental sub-scores (revenue, FCF, moat, valuation, balance sheet), technical scoring (200WMA/MMA distance), and a comprehensive bonus/penalty system
4. **Elliott Wave Detection** — Identifies wave structures, Claude interprets confluence zones
5. **Three-Pillar Valuation** — DCF + EV/Sales + EV/EBITDA composite rating
6. **Signal Tracking** — Detects upgrades/downgrades, fires Telegram alerts

**Fundamental Score (50 pts base):** Revenue growth (10), revenue momentum (5), FCF quality (10), moat tier (10), valuation vs sector (8), balance sheet (7)

**Technical Score (50 pts base):** Distance from 200 Weekly MA (25), distance from 200 Monthly MA (25)

**Bonus system:** Up to +75 pts from institutional signals, SAIN consensus, dividends, business quality, and confluence zones.

**Penalty system:** Up to -15 pts for value traps, late cycle risk, AI capex overexposure, carry trade vulnerability, and earnings proximity.

### Layer 2: Institutional Intelligence (Sprint 6A)

Tracks 8 super investors via SEC 13F filings:

| Investor | Fund | Style |
|----------|------|-------|
| Warren Buffett | Berkshire Hathaway | Value / quality compounders |
| David Tepper | Appaloosa Management | Distressed / cyclical recovery |
| Stanley Druckenmiller | Duquesne Family Office | Macro / growth |
| Chase Coleman | Tiger Global | Tech / high-growth |
| Steve Cohen | Point72 | Multi-strategy / quantamental |
| Paul Tudor Jones | Tudor Investment | Macro / technical |
| Philippe Laffont | Coatue Management | Tech-focused growth |
| Howard Marks | Oaktree Capital | Credit / deep value |

**Signals detected:** New positions, position increases (DCA conviction), reductions, exits, call option holdings (extreme conviction). Cross-investor consensus scored per ticker.

### Layer 3: Agentic Intelligence System (Sprint 8)

A model-agnostic LLM interface (`llm.js`) routes all AI calls through Claude. 14 skills across 8 categories execute in dependency order via an orchestrator:

| Category | Skills | What They Do |
|----------|--------|-------------|
| Technical | `interpret_wave`, `position_sizing` | Elliott Wave analysis, TLI position sizing |
| Fundamental | `classify_moat`, `assess_earnings`, `detect_value_trap` | Moat classification, earnings quality, value trap detection |
| Valuation | `three_pillar_value` | DCF + EV/Sales + EV/EBITDA composite |
| Institutional | `detect_consensus` | Cross-investor signal consensus |
| Macro | `assess_macro` | Market cycle, carry trade, geopolitical risk |
| Synthesis | `write_thesis`, `compare_to_greats` | Full investment thesis, Buffett/Cohen/Laffont comparison |
| Learning | `extract_principles`, `adjust_weights` | Outcome analysis, weight adjustment proposals |
| Social | `scan_social`, `scan_politicians` | X account scanning, politician trade extraction |

**Knowledge Base:** Documents are chunked, metadata-extracted via Haiku (tickers, investors, sectors, topics), and stored with PostgreSQL tsvector for full-text search. No vector embeddings — retrieval uses metadata array overlap + ts_rank scoring.

**Self-Improving:** The learning cycle analyzes signal outcomes, extracts principles, and proposes scoring weight adjustments. Safety guardrails clamp maximum change per factor and protect core rules from modification.

### Layer 4: SAIN — Social Intelligence Network (Sprint 9A)

Monitors 19+ real-time sources across 4 categories:

| Category | Sources | What's Tracked |
|----------|---------|---------------|
| **AI Model Portfolios** | The Grk Portfolio, Grokvesting, GPT Portfolio, Autopilot GPT | AI-generated stock picks and conviction levels |
| **Politician Trades** | Pelosi Tracker, Unusual Whales, Capitol Trades, QuiverQuant, Congress Trading, House/Senate Stock Watcher | STOCK Act filings with committee-sector matching |
| **Notable Investors** | ARK Daily Trades, Burry Tracker, Corporate Insider Trades, OpenInsider, Dataroma | Insider buys/sells, hedge fund 13F changes |
| **Market Signals** | Walter Bloomberg | Breaking market-moving news |

**Committee-Sector Matching:** When a politician on the Armed Services committee buys a defense stock, the signal gets a higher weight (+5 vs +2). 14 committee-to-GICS-sector mappings. 7 priority politicians tracked with individual multipliers.

**4-Layer Consensus Engine:**
- Layer 1: Super Investor Score (from 13F consensus)
- Layer 2: Politician Score (committee-weighted trades)
- Layer 3: AI Model Score (multi-model agreement)
- Layer 4: TLI Score (core algorithm output)

When all 4 layers agree: **FULL_STACK_CONSENSUS** (+15 pts)

### Market Context Layer (Sprint 6B)

Real-time macro risk monitor feeding into the penalty system:

| Indicator | What It Tracks |
|-----------|---------------|
| S&P 500 P/E | Market valuation level |
| VIX | Volatility / fear gauge |
| DXY Index | Dollar strength |
| JPY/USD | Carry trade stress (BOJ intervention risk) |
| Fed Rate / BOJ Rate | Carry spread |
| Berkshire Cash Ratio | Buffett's market timing signal |
| Geopolitical Risk | Iran/war active flag |

Risk levels: GREEN / YELLOW / ORANGE / RED. Late cycle score >= 3 triggers -5 penalty on all stocks.

### Three-Pillar Valuation (Sprint 6B)

Every scored stock gets a composite valuation:

1. **DCF** — Discounted cash flow with sector-appropriate growth assumptions
2. **EV/Sales** — vs 5-year historical average and sector peers
3. **EV/EBITDA** — vs 5-year historical average and sector peers

Output: BUY / OVERWEIGHT / HOLD / NEUTRAL rating with price targets and upside percentages.

## Signal Hierarchy

| Signal | Score | Meaning |
|--------|-------|---------|
| GENERATIONAL BUY | Special | 0.786 Fib + Wave 1 origin + 200MMA converging within 15% |
| FULL STACK CONSENSUS | Special | All 4 SAIN layers aligned (super investors + politicians + AI + TLI) |
| CONFLUENCE ZONE | 75+ bonus | 200WMA + 0.618 Fib within 3% |
| LOAD THE BOAT | 75-100 | Fundamental + technical sweet spot |
| ACCUMULATE | 60-74 | Dollar-cost average zone |
| WATCH | 40-59 | Monitor for improvement |
| PASS | <40 | Does not meet criteria |
| THESIS BROKEN | Any | Revenue declining, VALUE_TRAP detected, or fundamental deterioration |

## Scoring Algorithm

### Fundamental Bonuses

| Flag | Points | Trigger |
|------|--------|---------|
| FULL_STACK_CONSENSUS | +15 | All 4 SAIN layers agree |
| MULTI_NEW_BUY | +12 | 2+ super investors opened new positions this quarter |
| THREE_LAYER_CONSENSUS | +8 | 3 SAIN layers aligned |
| NEW_SUPER_BUY | +8 | 1 super investor new position |
| DIV_7PCT | +8 | Dividend yield >7% |
| MULTI_INVESTOR | +6 | 2+ super investors hold the stock |
| DCA_CONVICTION | +5 | 3+ consecutive quarterly adds by an investor |
| EXTREME_CONVICTION_CALLS | +5 | Super investor holding call options |
| HIGH_QUALITY_SAAS | +5 | Gross margin >70% AND FCF margin >20% |
| POLITICIAN_CONVICTION | +5 | Politician score >= 5 (committee match trades) |
| DIV_5PCT | +5 | Dividend yield >5% |
| AI_MODEL_CONSENSUS | +4 | AI model score >= 4 |
| SINGLE_INVESTOR | +3 | 1 super investor holds the stock |
| DIV_3PCT | +3 | Dividend yield >3% |
| CYCLICAL_RECOVERY | +3 | Forward P/E <10 in Industrials |
| BUYBACK_PROGRAM | +2 | Shares outstanding declining >2% |
| POLITICIAN_SIGNAL | +2 | Politician score >= 2 |
| AI_MODEL_SIGNAL | +2 | AI model score >= 2 |

### Fundamental Penalties

| Flag | Points | Trigger |
|------|--------|---------|
| VALUE_TRAP | -15 | Revenue growth >20% but FCF margin <0 and P/E >100 |
| EARNINGS_PROXIMITY | -15 | Earnings report within 14 days |
| SUSTAINED_EXIT_SIGNAL | -8 | 3+ consecutive quarterly reductions by investor |
| AI_CAPEX_RISK | -5 | Capex >$100B with FCF margin <15% |
| LATE_CYCLE_CONTEXT | -5 | Macro late cycle score >= 3 |
| SUPER_INVESTOR_DUMPING | -5 | Largest position reduction >50% |
| DEBT_CARRY_RISK | -5 | Carry trade risk HIGH with debt/equity >2.0 |
| RAPID_THESIS_FAILURE | -3 | Rapid position abandonment by investor |
| CAPEX_CREDIBILITY_RISK | -3 | Capex >$50B with FCF margin <10% |
| GAAP_NONGAAP_DIVERGENCE | -2 | GAAP vs non-GAAP earnings divergence >20% |

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Backend | Node.js Express on Railway | Pipeline, scoring, 45+ API endpoints, skills, cron |
| Scraper | Python FastAPI on Railway | Polygon data, SEC 13F, beta computation |
| Frontend | React 18 / Vite / Tailwind / Framer Motion on Cloudflare Pages | Dashboard, screener, deep dive, intelligence feed |
| Database | Supabase (PostgreSQL + tsvector + GIN indexes) | 26 tables, knowledge base, signal tracking |
| AI | Claude API (Haiku for speed, Sonnet for reasoning) | ALL intelligence — thesis, extraction, classification |
| Social | X API v2 | SAIN social scanning |
| Market Data | Polygon.io | Prices, fundamentals, historical |
| Alerts | Telegram Bot API | Real-time signal alerts + weekly briefs |

## Environment Variables

### Backend (Railway)

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (bypasses RLS) |
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `CLAUDE_MODEL` | No | Default model (default: claude-haiku-4-5-20251001) |
| `SCRAPER_URL` | Yes | Internal Railway scraper URL |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token for alerts |
| `TELEGRAM_CHAT_ID` | No | Telegram chat ID for alerts |
| `X_BEARER_TOKEN` | No | X API bearer token for SAIN social scanning |
| `QUIVERQUANT_API_KEY` | No | QuiverQuant API for politician trade data |
| `PORT` | No | Server port (default: 3000) |

### Scraper (Railway)

| Variable | Required | Description |
|----------|----------|-------------|
| `POLYGON_API_KEY` | Yes | Polygon.io API key |
| `POLYGON_RATE_DELAY` | No | Rate limit delay in seconds (default: 12 for free tier) |

### Frontend (Cloudflare Pages)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |

## Setup

### 1. Supabase

1. Create a new Supabase project
2. Go to **SQL Editor**
3. Paste and run the full contents of `supabase/migration_complete.sql`
4. Copy your **project URL**, **anon key**, and **service role key** from Settings > API

### 2. Railway — Backend

1. New service from this repo
2. **Root Directory:** `backend`
3. **Build Command:** `npm install`
4. **Start Command:** `node server.js`
5. **Health Check Path:** `/health`
6. Add all backend environment variables
7. Deploy — the full pipeline runs immediately on startup

### 3. Railway — Scraper

1. New service from this repo
2. **Root Directory:** `scraper`
3. **Start Command:** `uvicorn main:app --host 0.0.0.0 --port 8000`
4. Add `POLYGON_API_KEY`
5. Use internal networking so the backend can reach it at `http://tli-scraper.railway.internal:8000`

### 4. Cloudflare Pages — Frontend

1. New project from this repo
2. **Root Directory:** `frontend`
3. **Build Command:** `npm run build`
4. **Build Output:** `dist`
5. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
6. Deploy

### 5. Telegram Bot (Optional)

1. Message **@BotFather** on Telegram, create a bot, get the token
2. Start a chat with your bot, get your chat ID from `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` to Railway backend env vars

### 6. Seed Data

```bash
# Seed the knowledge base with TLI methodology documents
cd backend && node scripts/seed_knowledge_base.js

# Seed SAIN tracked sources (X accounts, politician trackers, etc.)
node scripts/seed_sain_sources.js
```

## Pipeline Schedule

| Job | Schedule | What It Does |
|-----|----------|-------------|
| Full Pipeline | Sunday 6am ET + Wednesday 6am ET | Universe fetch, prescreen, deep score, wave count, valuations |
| Weekly Brief | Sunday 8am ET | Claude-generated market brief sent via Telegram |
| SAIN Social Scan | Every 6 hours | Scan X accounts for investment signals |
| SAIN Politician Scan | Every 12 hours | Scrape QuiverQuant for politician trades |
| SAIN Consensus | Every 12 hours (+30m offset) | Recompute 4-layer consensus for all tickers |

## API Endpoints (45+)

### Institutional Intelligence
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/investors` | List all 8 tracked super investors |
| GET | `/api/investors/:id/holdings` | Latest holdings for an investor |
| GET | `/api/investors/:id/signals` | Quarterly signals for an investor |
| GET | `/api/consensus/:ticker` | Cross-investor consensus for a ticker |
| GET | `/api/consensus/sectors` | Sector-level consensus |
| GET | `/api/consensus/top-picks` | Top consensus picks |

### Macro & Valuation
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/macro-context` | Latest macro risk context |
| GET | `/api/macro-context/history` | Macro context history |
| GET | `/api/valuation/:ticker` | Three-pillar valuation for a ticker |
| POST | `/api/valuation/compute/:ticker` | Compute fresh valuation |
| GET | `/api/dashboard/market-risk` | Dashboard market risk widget |
| GET | `/api/dashboard/top-signals` | Top scoring stocks |
| GET | `/api/dashboard/consensus-summary` | Top buys and sells |

### Signal Tracking & Exit Signals
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/signals/history` | Signal change history |
| GET | `/api/signals/accuracy` | Signal accuracy stats |
| GET | `/api/exit-signals` | Active exit signals |
| GET | `/api/exit-signals/:ticker` | Exit signals for a ticker |
| POST | `/api/exit-signals/:id/acknowledge` | Acknowledge an exit signal |

### Agentic Intelligence (Sprint 8)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/analyze/:ticker` | Run full agentic analysis |
| GET | `/api/analysis/:ticker` | Get stored analysis |
| GET | `/api/analysis/:ticker/thesis` | Get investment thesis |
| POST | `/api/knowledge/ingest` | Ingest a document into knowledge base |
| POST | `/api/knowledge/search` | Search knowledge base |
| GET | `/api/knowledge/stats` | Knowledge base statistics |
| GET | `/api/skills` | List all available skills |
| POST | `/api/skills/:skillName` | Invoke a specific skill |
| POST | `/api/learning/cycle` | Run a learning cycle |
| GET | `/api/learning/adjustments` | Get pending weight adjustments |
| PUT | `/api/learning/adjustments/:id` | Approve or reject a weight adjustment |
| GET | `/api/learning/principles` | Get learned principles |
| POST | `/api/compare-greats/:ticker` | Compare stock to Buffett/Cohen/Laffont |

### SAIN — Social Intelligence (Sprint 9A)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sain/sources` | List active SAIN sources |
| POST | `/api/sain/sources` | Add a new source |
| GET | `/api/sain/signals` | Recent signals (all categories) |
| GET | `/api/sain/signals/politicians` | Politician trade signals |
| GET | `/api/sain/signals/ai-models` | AI model signals |
| GET | `/api/sain/signals/:ticker` | Signals for a specific ticker |
| GET | `/api/sain/consensus/full-stack` | Full stack consensus tickers |
| GET | `/api/sain/consensus/top` | Top SAIN consensus scores |
| GET | `/api/sain/consensus/:ticker` | SAIN consensus for a ticker |
| POST | `/api/sain/scan` | Trigger full SAIN scan manually |
| POST | `/api/sain/scan/:category` | Scan a specific category |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/investor-holdings` | Manual holdings entry |
| POST | `/api/admin/refresh-institutional` | Trigger institutional refresh |
| POST | `/api/admin/macro-context` | Update macro context |
| GET | `/health` | Service health check |

## Sprint History

| Sprint | What It Built |
|--------|--------------|
| 1-4 | Core pipeline, TLI scoring engine, Elliott Wave detection, Telegram alerts, frontend dashboard |
| 5 | Exit signal system with severity levels and acknowledgment |
| 6A | Enhanced scoring (FCF, moat, balance sheet sub-scores) + institutional tracker (8 super investors via SEC 13F) |
| 6B | Market context layer (macro risk monitor) + dashboard widgets + three-pillar valuation (DCF + EV/Sales + EV/EBITDA) |
| 7 | Data pipeline migration to Polygon.io, field gap fixes, beta computation, 13F seeding, enrichment pipeline |
| 8 | Agentic intelligence system — model-agnostic LLM interface, knowledge base (tsvector), 14 skills, orchestrator, thesis engine, self-learning feedback loop |
| 9A | SAIN backend — X API scanner, politician trade scraper (committee-weighted), 4-layer consensus engine, 19 tracked sources |
| 9B | *Next* — SAIN frontend (intelligence feed, consensus dashboard, politician trade timeline) |

---

*Not financial advice. For educational and informational purposes only. Do your own research.*
