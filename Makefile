.PHONY: help dev dev-deps up down test test-api test-worker lint build clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Local Development ─────────────────────────────────────────────────────

dev-deps: ## Install all development dependencies
	cd apps/worker && pip install -e ".[dev]"
	cd apps/api && pip install -e ".[dev]"
	pnpm install

dev: ## Start API + Web in development mode (requires Postgres + Redis via docker-compose)
	@echo "Starting infrastructure..."
	docker compose up -d postgres redis
	@echo "Waiting for services..."
	@sleep 3
	@echo "Starting API on :8000 and Web on :3000..."
	@(cd apps/api && SIMUALPHA_DATABASE_URL=postgresql://simualpha:simualpha@localhost:5432/simualpha uvicorn app.main:app --reload --port 8000) & \
	(cd apps/web && pnpm dev) & \
	wait

api: ## Start API server only (with SQLite fallback)
	cd apps/api && uvicorn app.main:app --reload --port 8000

web: ## Start web frontend only
	cd apps/web && pnpm dev

worker: ## Start RQ worker (requires Redis)
	cd apps/worker && python -m worker.main worker

# ── Docker ────────────────────────────────────────────────────────────────

up: ## Start full stack with Docker Compose
	docker compose up --build -d

down: ## Stop all Docker Compose services
	docker compose down

logs: ## Tail logs from all services
	docker compose logs -f

# ── Testing ───────────────────────────────────────────────────────────────

test: test-api test-worker ## Run all tests

test-api: ## Run API tests
	cd apps/api && python -m pytest tests/ -x -q --tb=short

test-worker: ## Run worker tests
	cd apps/worker && python -m pytest tests/ -x -q --tb=short

# ── Quality ───────────────────────────────────────────────────────────────

lint: ## Lint all code
	cd apps/api && ruff check .
	cd apps/worker && ruff check .
	cd apps/web && pnpm lint

typecheck: ## Type-check all code
	cd apps/web && pnpm typecheck

# ── Build ─────────────────────────────────────────────────────────────────

build: ## Build all artifacts
	cd apps/web && pnpm build
	docker compose build

clean: ## Remove build artifacts and caches
	rm -rf apps/web/out apps/web/.next
	rm -rf apps/api/simualpha_fallback.db
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
