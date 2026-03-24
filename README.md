# SimuAlpha

Financial distress-risk intelligence platform. Analyze the financial strength of any public company using debt, liquidity, cash flow, and long-term fundamental analysis.

## Architecture

```
apps/
  ├── web/        → Next.js frontend (React 19, Tailwind CSS)
  ├── api/        → FastAPI backend (Python 3.11+, SQLAlchemy, Alembic)

packages/
  ├── ui/         → Shared React components
  └── types/      → Shared TypeScript types
```

### Services (Production)

| Service | Platform | Purpose |
|---------|----------|---------|
| Frontend | Cloudflare Pages / Railway | Next.js SSR app |
| API | Railway | FastAPI distress analysis engine |
| Database | Supabase | PostgreSQL |

**Worker service removed** — the analysis engine runs synchronously within the API. A background worker can be re-added later if needed for scheduled report refreshes.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | Health check |
| POST | `/api/v1/analyze` | Analyze a ticker for distress risk |
| GET | `/api/v1/report/{ticker}` | Get cached report for a ticker |
| GET | `/api/v1/recent` | List recent reports |
| GET | `/api/v1/validate/{ticker}` | Check if a ticker is recognized |
| GET | `/api/v1/methodology` | Scoring methodology data |
| POST | `/api/v1/auth/register` | User registration |
| POST | `/api/v1/auth/login` | User login |
| GET | `/api/v1/auth/me` | Current user profile |

## Environment Variables

### API (`apps/api/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `SIMUALPHA_DATABASE_URL` | Yes | PostgreSQL connection string (Supabase) |
| `SIMUALPHA_JWT_SECRET` | Yes (prod) | 64+ char JWT signing key |
| `SIMUALPHA_CORS_ORIGINS` | No | JSON array of allowed origins |
| `SIMUALPHA_FINANCIAL_DATA_API_KEY` | No | API key for live financial data provider |
| `SIMUALPHA_REPORT_CACHE_TTL` | No | Report cache TTL in seconds (default: 21600) |
| `SIMUALPHA_DEBUG` | No | Enable debug mode |

### Frontend (`apps/web/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | Backend API URL |

## Development

```bash
# Prerequisites: Node 20+, pnpm 9+, Python 3.11+

# Install frontend deps
pnpm install

# Install API deps
cd apps/api && pip install -e ".[dev]"

# Run all services
pnpm dev          # Frontend on :3000
cd apps/api && uvicorn app.main:app --reload  # API on :8000
```

## Database

The Supabase schema is managed via:
- **Alembic migrations**: `apps/api/alembic/versions/`
- **Manual SQL**: `supabase_migration.sql` (paste into Supabase SQL editor)

### Core Tables

| Table | Purpose |
|-------|---------|
| `distress_reports` | Financial distress analysis reports |
| `report_history` | Historical snapshots for trend tracking |
| `users` | User accounts |
| `refresh_tokens` | JWT token management |
| `watchlists` | User watchlists |
| `watchlist_items` | Watchlist ticker items |

## Scoring Model

SimuAlpha uses a multi-factor composite distress score (0-100):
- **Liquidity** (~20%): Current ratio, cash-to-debt
- **Leverage** (~20%): D/E, D/A, debt/EBITDA
- **Profitability** (~15%): Operating margin, net margin, trends
- **Cash Flow** (~20%): OCF, FCF, direction
- **Interest Coverage** (~15%): EBITDA / interest expense
- **Altman Z-Score** (~10%): Academic distress model

Rating scale: **Low** (0-25) / **Moderate** (26-50) / **High** (51-75) / **Severe** (76-100)
