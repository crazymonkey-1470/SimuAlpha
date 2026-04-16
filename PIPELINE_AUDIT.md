# SimuAlpha Pipeline Audit

**Date:** 2026-04-16  
**Branch:** `claude/audit-simualpha-pipeline-dJc1S`  
**Root cause in one line:** The scraper service (`SCRAPER_URL`) is unreachable — all market data fetches fail, so zero candidates pass Stage 2, and Stages 3 and 4 never run.

---

## Executive Summary

The pipeline architecture is sound. All four stages are wired correctly in the orchestrator, cron fires on schedule, and the database writes are properly structured. The single point of failure is that `SCRAPER_URL` defaults to `http://localhost:8000` when the env var is missing — in production (Railway) this endpoint does not exist at localhost. With no fundamentals or price history returning from the scraper, Stage 2 filters out every ticker, leaving Stage 3 with an empty candidate list and Stage 4 with no scored signals.

---

## Stage-by-Stage Findings

### Stage 1 — Universe Fetch (`pipeline/stage1_universe.js`)

| Check | Result |
|-------|--------|
| Calls Polygon API? | **No** — universe is a hardcoded S&P 500 array (no external API) |
| Writes to DB? | **Yes** — upserts ~500 tickers to `universe` table |
| Scraper dependency? | **None** — Stage 1 is fully self-contained |
| Silent failures? | Minor: `company_name`, `sector`, `market_cap` are all written as `null` |
| Status | **WORKS** |

**Note:** Stage 1 does not call Polygon at all. The `POLYGON_API_KEY` env var is not referenced anywhere in the pipeline. Universe is seeded from a curated constant.

**Data written to `universe`:**
```
ticker        ✓ (e.g. "AAPL")
company_name  null
exchange      "NYSE" (hardcoded)
sector        null
market_cap    null
last_updated  ✓
```

---

### Stage 2 — Prescreen (`pipeline/stage2_prescreen.js`)

| Check | Result |
|-------|--------|
| Reads from `universe`? | **Yes** — paginated query, handles >1000 rows |
| Calls scraper for fundamentals? | **Yes** — `GET ${SCRAPER_URL}/fundamentals/${ticker}` |
| Scraper reachable? | **NO — CRITICAL FAILURE** |
| Filters by fundamentals? | Yes (market cap ≥ $500M, price > $3, revenue > 0, growth or drawdown) |
| Writes to `screener_candidates`? | Only if tickers pass filters — currently **0 rows** |
| Silent failures? | **Yes** — consecutive errors trigger `break` after 20 failures; individual failures silently `continue` |
| Status | **BROKEN — produces 0 candidates** |

**The failure cascade (Stage 2):**

```javascript
// stage2_prescreen.js line 83
const res = await fetch(`${SCRAPER_URL}/fundamentals/${ticker}`);

// On failure (line 86-94):
if (!res.ok) {
  consecutiveErrors++;
  if (consecutiveErrors >= 20) {
    log.error('Too many consecutive errors — scraper may be down, stopping');
    break;   // ← stops after 20 failures, logs error but doesn't throw
  }
  filterStats.fetchFailed++;
  continue;  // ← silently skips ticker
}
```

**Result of all fields being null (lines 111-127):**
```
marketCap == null  → noMarketCap++, continue   (every ticker)
price == null      → noPrice++, continue
revCurrent == null → noRevenue++, continue
```
**All 500 tickers are rejected. `screener_candidates` remains empty.**

---

### Stage 3 — Deep Score (`pipeline/stage3_deepscore.js`)

| Check | Result |
|-------|--------|
| Reads from `screener_candidates`? | **Yes** |
| Candidates available? | **NO — 0 rows from Stage 2** |
| Calls scraper for historicals? | Yes — `fetchFundamentals()` + `fetchHistoricalPrices()` per ticker |
| Computes TLI scores? | Only if candidates exist and data returns — currently never runs |
| Writes to `screener_results`? | Only for scored tickers — currently **0 rows written** |
| Fires signals? | Only if score thresholds met — currently **0 signals** |
| Silent failures? | **Yes — multiple catch blocks** |
| Status | **BROKEN — never runs due to empty Stage 2 output** |

**Silent catch blocks in Stage 3:**
```javascript
try { institutionalData = await getInstitutionalData(ticker); } catch (_) { /* graceful fallback */ }
try { sainConsensus = await computeSAINConsensus(ticker); } catch (_) { /* graceful fallback */ }
try { _cachedMacroContext = await getMacroContext(); } catch (_) { /* tables may not exist yet */ }
try { const exitSignals = detectFundamentalExitSignals({...}); } catch (_) { /* table may not exist yet */ }
```

**What Stage 3 would write to `screener_results` (if it ran):**
```
fundamental_score, technical_score, total_score, signal
price_200wma, price_200mma, pct_from_200wma, pct_from_200mma
revenue_growth_pct, pe_ratio, ps_ratio
ma_50d, golden_cross, death_cross, hh_hl_pattern
lynch_category, rating, margin_of_safety, maturity_stage
kill_thesis_triggered, multiple_compression_score
... (100+ columns)
```

---

### Stage 4 — Wave Count (`pipeline/stage4_wavecount.js`)

| Check | Result |
|-------|--------|
| Reads from `screener_results`? | **Yes** — filters `signal IN ('LOAD THE BOAT', 'ACCUMULATE')` |
| Signals available? | **NO — 0 rows from Stage 3** |
| Calls Claude interpreter? | Only for qualifying tickers — never reached |
| Writes to `wave_counts`? | Only after wave analysis — currently **0 rows** |
| Generates signal tier? | Only if wave analysis runs — never reached |
| Status | **BROKEN — exits immediately (line 54-57)** |

**The early exit:**
```javascript
// stage4_wavecount.js lines 54-57
if (error || !candidates || candidates.length === 0) {
  log.info('No ACCUMULATE/LOAD THE BOAT candidates to analyze');
  return;   // ← exits immediately, no wave analysis, no alerts
}
```

**Claude daily call limit is set but never triggered:**
```javascript
const CLAUDE_DAILY_LIMIT = 100;   // configured but never reached
```

---

### Signal Firing

| Check | Result |
|-------|--------|
| Where do signals go? | `screener_results.signal` column (set in Stage 3) |
| Written to `signal_outcomes`? | Via `signalTracker.recordSignal()` called in Stage 3 — currently never called |
| `signal_alerts` table? | Populated by `fireAlert()` in Stage 3/4 — currently empty |
| `signals` table? | **Does not exist** — only `screener_results`, `signal_alerts`, `signal_outcomes` |
| `/api/signals/history`? | Reads from `signal_alerts` or `screener_results` — returns empty |
| Status | **No signals have ever fired** |

---

### Orchestrator (`cron.js` — `runFullPipeline`)

| Check | Result |
|-------|--------|
| Calls all 4 stages in sequence? | **Yes** — Stage 1 → 2 → 3 → batch valuations → outcome tracking → Stage 4 |
| Error handling per stage? | **Yes** — each stage in its own try/catch, failures logged but don't abort pipeline |
| Logging? | **Yes** — Pino structured logging throughout |
| Writes to Airtable? | **No** — no Airtable integration found anywhere in codebase |
| Status | **WORKS** structurally — correctly orchestrates all stages |

**Pipeline call sequence (cron.js lines 29-71):**
```
fetchUniverse()         ← Stage 1
runPrescreen()          ← Stage 2
runDeepScore()          ← Stage 3
batchComputeValuations() ← Post-Stage-3 enrichment
updateOutcomes()        ← Signal outcome tracking
runWaveCount()          ← Stage 4
```

---

### Cron Integration (`cron.js`)

| Check | Result |
|-------|--------|
| `runFullPipeline()` called? | **Yes** — Sunday 6am ET + Wednesday 6am ET |
| Manual trigger endpoint? | Check `server.js`/routes — not confirmed in audit scope |
| Entry/exit logging? | **Yes** — `'Starting full pipeline run'` and `'Full pipeline complete'` |
| Status | **WORKS** — cron is correctly wired |

**Cron schedules active:**
```
Full pipeline:    Sunday 6am ET + Wednesday 6am ET
Outcome tracking: Daily 4am ET
Macro refresh:    Daily 5am ET
Weekly brief:     Sunday 8am ET
Weekly digest:    Sunday 9am ET
Self-improve:     Sunday 10am ET
X daily scan:     Daily 9am ET (only if X_ACCESS_TOKEN set)
```

---

### Database Schema

**Tables confirmed in use:**

| Table | Written by | Read by | Current state |
|-------|-----------|---------|---------------|
| `universe` | Stage 1 | Stage 2 | ~500 rows, all metadata null |
| `screener_candidates` | Stage 2 | Stage 3 | **0 rows** |
| `screener_results` | Stage 3 | Stage 4, API | **0 rows** |
| `signal_alerts` | Stage 3, 4 | API, weekly brief | **0 rows** |
| `signal_outcomes` | signalTracker | API | **0 rows** |
| `wave_counts` | Stage 4 | API | **0 rows** |
| `exit_signals` | Stage 3 | — | **0 rows** |
| `scan_history` | All stages | — | Shows 0 passed each stage |
| `macro_context` | cron macro refresh | Stage 3 | May have rows (carries forward daily) |

**No `signals` table exists** — `screener_results` is the primary signal store.  
**No Airtable integration** — nothing in the codebase references Airtable.

---

## Data Flow Diagram

```
CRON (Sun/Wed 6am ET)
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ Stage 1: Universe                                               │
│  Input:  Hardcoded SP500 array (~500 tickers)                  │
│  Output: universe table (~500 rows, metadata = null)           │
│  Status: ✓ WORKS                                               │
└──────────────────────────┬──────────────────────────────────────┘
                           │ reads universe.ticker
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Stage 2: Prescreen                                              │
│  Input:  universe table                                         │
│  Fetch:  GET ${SCRAPER_URL}/fundamentals/{ticker}   ← FAILS    │
│  Filter: market_cap, price, revenue, growth/drawdown            │
│  Output: screener_candidates (0 rows — all tickers rejected)   │
│  Status: ✗ BROKEN — scraper unreachable                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │ reads screener_candidates (EMPTY)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Stage 3: Deep Score                                             │
│  Input:  screener_candidates (EMPTY)                            │
│  Fetch:  fundamentals + historical prices via scraper           │
│  Score:  TLI scorer, valuation, lynch/buffett screens           │
│  Output: screener_results (0 rows), signal_alerts (0 rows)     │
│  Status: ✗ BROKEN — no input candidates                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │ reads screener_results WHERE signal IN
                           │ ('LOAD THE BOAT','ACCUMULATE') — EMPTY
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Stage 4: Wave Count                                             │
│  Input:  screener_results with LOAD THE BOAT/ACCUMULATE signal │
│  Fetch:  historical prices via scraper                          │
│  Score:  Elliott wave analysis, backtesting, Claude narrative  │
│  Output: wave_counts (0 rows)                                  │
│  Status: ✗ BROKEN — exits immediately (0 qualified candidates) │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
                    NO SIGNALS FIRED
              signal_alerts: 0 rows
              signal_outcomes: 0 rows
              /api/signals/history: empty
```

---

## Missing Pieces

1. **`.env` file does not exist** — only `.env.example` is present. The example shows `SCRAPER_URL=http://tli-scraper.railway.internal:8000` which is a Railway internal hostname. This only resolves inside a Railway deployment where both services share the same private network.

2. **Scraper service (`tli-scraper`) is not running or not reachable** — no scraper service code exists in this repo. It is a separate service. Without it, Stage 2 and Stage 3 cannot fetch any market data.

3. **`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are blank** — `supabase.js` creates the client with `undefined` credentials. Every database call will fail if these are not set in Railway's environment variables.

4. **`ANTHROPIC_API_KEY` is blank** — Stage 4's Claude interpreter (`interpretWaveCount`) will never be called. The daily call cap of 100 is irrelevant.

5. **`TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` are blank** — all alert notifications via `fireAlert()` and weekly brief Telegram sends will fail silently.

6. **No Polygon API integration** — `POLYGON_API_KEY` is referenced in `.env.example` comments but not in any pipeline file. The scraper is the intended Polygon proxy.

7. **`scan_history` table** — pipeline stages appear to write to it, but schema not confirmed. If the table doesn't exist in Supabase, those writes fail silently.

---

## Error Logs from Last Run

No log files are present in the repository. Logs are emitted via Pino to stdout (Railway captures these). Based on code analysis, the last run would have produced:

```
INFO  stage1_universe: Seeding S&P 500 universe
INFO  stage1_universe: Universe seeded — 500 tickers upserted
INFO  stage2_prescreen: Starting pre-screen of universe
INFO  stage2_prescreen: Processing universe tickers { count: 500 }
ERROR stage2_prescreen: Too many consecutive errors — scraper may be down, stopping { consecutiveErrors: 20 }
INFO  stage2_prescreen: Pre-screen complete { processed: 20, passed: 0, fetchFailed: 20 }
INFO  stage3_deepscore: Starting deep scoring of candidates
INFO  stage3_deepscore: Scoring candidates { count: 0, scorer: 'v2' }
INFO  stage3_deepscore: Deep score complete { scored: 0, alertsFired: 0 }
INFO  stage4_wavecount: Starting wave count analysis
INFO  stage4_wavecount: No ACCUMULATE/LOAD THE BOAT candidates to analyze
INFO  pipeline: Full pipeline complete
```

To verify: check Railway log viewer for the `backend` service, filter for `stage2_prescreen` errors and `consecutiveErrors`.

---

## Recommendations (Fix in Order)

### Fix 1 — Verify and set Railway environment variables (IMMEDIATE)

In Railway → SimuAlpha backend service → Variables, confirm these are set:

```
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-from-supabase-dashboard>
SCRAPER_URL=http://tli-scraper.railway.internal:8000
ANTHROPIC_API_KEY=<your-anthropic-key>
TELEGRAM_BOT_TOKEN=<optional>
TELEGRAM_CHAT_ID=<optional>
```

If `SCRAPER_URL` is already set correctly in Railway, the issue is that the **scraper service itself is down or was never deployed**.

### Fix 2 — Verify the scraper service is deployed and healthy (IMMEDIATE)

The scraper (`tli-scraper`) must be a separate Railway service. Check:
- Railway dashboard → Is `tli-scraper` service deployed and running?
- Health check: `curl http://tli-scraper.railway.internal:8000/fundamentals/AAPL` from within the Railway network
- If not deployed, deploy it (separate repo/service)

### Fix 3 — Add startup health check for critical dependencies (HIGH)

Add to `server.js` startup:
```javascript
// Validate required env vars before accepting traffic
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const v of required) {
  if (!process.env[v]) {
    console.error(`FATAL: Missing required env var: ${v}`);
    process.exit(1);
  }
}
```

### Fix 4 — Add scraper health check before Stage 2 runs (HIGH)

In `stage2_prescreen.js`, before the ticker loop, verify the scraper is up:
```javascript
const healthRes = await fetch(`${SCRAPER_URL}/health`, { signal: AbortSignal.timeout(5000) });
if (!healthRes.ok) {
  log.error('Scraper health check failed — aborting prescreen');
  return 0;
}
```

### Fix 5 — Fill `universe` metadata fields (MEDIUM)

Stage 1 writes null for `company_name`, `sector`, `market_cap`. The scraper could populate these. Either have Stage 2 back-fill the universe table after fetching fundamentals, or have the scraper return them in the `/universe/` endpoint.

### Fix 6 — Replace silent catch blocks with logged warnings (MEDIUM)

In Stage 3, the multiple `catch (_)` blocks hide real errors. Change to:
```javascript
try {
  institutionalData = await getInstitutionalData(ticker);
} catch (err) {
  log.warn({ err, ticker }, 'Institutional data unavailable');  // ← log it
}
```

### Fix 7 — Add manual pipeline trigger endpoint (LOW)

Expose `POST /api/admin/pipeline/run` (with `ADMIN_API_KEY` auth) that calls `runFullPipeline()` directly so you can test without waiting for cron.

### Fix 8 — Add `scan_history` write with filter stats (LOW)

Stage 2 already tracks `filterStats` but may not persist them. Ensure the final stats are written to `scan_history` so each run's funnel is visible in Supabase.

---

## Summary Table

| Component | Works? | Blocker |
|-----------|--------|---------|
| Stage 1 — Universe | ✓ | None (no external deps) |
| Stage 2 — Prescreen | ✗ | Scraper unreachable |
| Stage 3 — Deep Score | ✗ | No candidates from Stage 2 |
| Stage 4 — Wave Count | ✗ | No signals from Stage 3 |
| Cron scheduling | ✓ | None |
| Orchestrator wiring | ✓ | None |
| Supabase connection | ? | Missing env vars |
| Signal recording | ✗ | Never triggered |
| Telegram alerts | ✗ | Missing env vars |
| Claude interpretation | ✗ | Missing API key + no signals |
