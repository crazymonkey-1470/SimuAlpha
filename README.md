# SimuAlpha

Quantitative market intelligence and simulation platform.

## Monorepo Structure

```
simualpha/
├── apps/
│   ├── web/          # Next.js frontend (App Router, TypeScript, Tailwind CSS)
│   ├── api/          # FastAPI backend service
│   └── worker/       # Python worker for simulations and scheduled tasks
├── packages/
│   ├── ui/           # Shared React UI components
│   └── types/        # Shared TypeScript types and API contracts
├── .github/workflows # CI pipelines
└── docs/             # Project documentation
```

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9
- **Python** >= 3.11

## Getting Started

### Install dependencies

```bash
pnpm install
```

### Run the frontend

```bash
# From the repo root
pnpm dev:web

# Or from the app directory
cd apps/web && pnpm dev
```

The frontend runs at `http://localhost:3000`.

### Run the API

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

The API runs at `http://localhost:8000`. Swagger docs are at `/docs`.

### Run the worker

```bash
cd apps/worker
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
python -m worker.main
```

## Development Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all TypeScript apps in dev mode |
| `pnpm dev:web` | Start only the frontend |
| `pnpm build` | Build all TypeScript packages and apps |
| `pnpm lint` | Lint all TypeScript packages and apps |
| `pnpm typecheck` | Type-check all TypeScript packages and apps |

## Architecture

- **Frontend** (`apps/web`): Next.js App Router with TypeScript and Tailwind CSS. Consumes shared UI components from `packages/ui` and types from `packages/types`.
- **API** (`apps/api`): FastAPI service providing the backend REST API. Runs independently with its own Python environment.
- **Worker** (`apps/worker`): Standalone Python service for running simulations, background jobs, and scheduled tasks. Separate from the API to allow independent scaling.
- **Shared UI** (`packages/ui`): Reusable React components shared across frontend apps.
- **Shared Types** (`packages/types`): TypeScript type definitions and API contracts shared across frontend packages.

## Tooling

- **pnpm workspaces** for TypeScript package management
- **Turborepo** for build orchestration and caching
- **GitHub Actions** for CI

## Future Development

Product logic — market data ingestion, simulation engines, portfolio analytics, and UI dashboards — will be built into the existing app and package structure. The scaffold is designed so that each service can grow independently while sharing types and components where appropriate.
