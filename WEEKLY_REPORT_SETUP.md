# Weekly Report System

## Schedule
- **Every Wednesday at 12:00 EST (17:00 UTC)** — Analyzes all posts from past week
- **Every Friday at 16:00 EST (21:00 UTC)** — Second weekly report (captures Fri/Sat activity)

Both reports:
1. Analyze posts from all tracked X accounts (TLI, AI/Agent, Macro, Trade Ideas, etc.)
2. Extract key themes, market movements, tickers, and learnings
3. Generate concise report
4. Store in Airtable "Weekly Reports" table
5. Send via Telegram to Andrew (@8626469251)

---

## What Gets Analyzed

Posts from these sources (past 7 days):
- **TLI Posts** — Elliott Wave analysis, wave counts, Fib targets
- **AI & Agent Intelligence** — New AI methodologies, agent patterns
- **AutoPilot** — @joinautopilot investor insights
- **Politician Trades** — @QuiverQuant, @pelositracker insider buys
- **Trade Ideas** — @Mr_Derivatives daily setups
- **Macro & Markets** — @Hedgeye, @brewmarkets macro context

---

## Report Contents

**What's included:**
- Number of posts analyzed by source
- TLI insights (wave counts, key setups)
- AI learnings (new agent patterns, methodologies)
- Trade activity (tickers tracked, signals)
- Macro context (VIX, breadth, regime changes)
- Top 10 tickers mentioned

**What's NOT included:**
- Price predictions (derived from actual data only)
- Personal opinions (only if sourced from tracked accounts)
- Made-up data (fails if post analysis returns nothing)

---

## Setup Instructions

### 1. Create "Weekly Reports" table in Airtable

Table name: **Weekly Reports**

Fields:
| Field Name | Type | Notes |
|---|---|---|
| Week Ending | Date | YYYY-MM-DD format |
| Report Content | Long text | Full report markdown |
| Status | Single select | Draft / Published |

### 2. Verify env vars in Railway

```
AIRTABLE_API_KEY=patXXXX
AIRTABLE_BASE_ID=app57wLO5tYgpApjP
TELEGRAM_BOT_TOKEN=xxxxx
TELEGRAM_CHAT_ID=8626469251 (Andrew's ID)
```

### 3. Deploy backend

The weekly_report_cron.js is already integrated into cron.js.
Just deploy to Railway and the schedules activate automatically.

---

## Testing

Run manually:
```bash
node /data/workspace/SimuAlpha/backend/cron/weekly_report_cron.js
```

This will:
1. Query all tables for posts from past 7 days
2. Generate a report
3. Store in Airtable
4. Send to Telegram

---

## Example Report (Template)

```
**Weekly Market Report — Week of 2026-04-20**

Analyzed 99 posts from this week across 6 sources.

**Elliott Wave & TLI:**
12 Elliott Wave analyses posted. Focus on Wave 5 final rally thesis and ABC correction targets.

**AI & Agent Intelligence:**
27 AI/agent posts. Key insight: multi-clauding (200+ messages/day) is standard for power users.

**Trade Activity:**
15 trade ideas/signals. Top tickers: NVDA, HIMS, UNH, ETH, OSCR

**Macro Context:**
10 macro updates. Watch: VIX compression, breadth deteriorating, classic top structure warning.

**Tickers Tracked:**
NVDA, HIMS, UNH, ETH, OSCR, GRRR, MSTR, BABA, NFLX, PLTR

*(Full data in Airtable Weekly Reports table)*
```

---

## Automation

The system runs without intervention. Reports auto-generate at scheduled times and appear in:
1. **Airtable** — Weekly Reports table (searchable history)
2. **Telegram** — Andrew's direct chat (real-time notification)

If a report has no posts that week, it's skipped silently.
