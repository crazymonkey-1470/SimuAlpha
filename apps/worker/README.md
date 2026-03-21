# SimuAlpha Worker

Simulation engine and job runner for the SimuAlpha platform.

## Quick Start

```bash
cd apps/worker

# Install dependencies
pip install -e ".[dev]"

# Run a simulation
python -m worker.main simulate

# Run with a fixed seed (deterministic output)
python -m worker.main simulate --seed 42

# Generate a replay frame for a specific date
python -m worker.main replay --date 2025-03-18

# Generate replay frames for a date range
python -m worker.main replay --start 2025-03-17 --end 2025-03-21

# Run calibration scaffold
python -m worker.main calibrate

# View scheduled job definitions
python -m worker.main schedule

# View recent job runs (in-memory, current session only)
python -m worker.main status
```

## Output Modes

Set via `OUTPUT_MODE` environment variable or `.env` file:

- **`log`** (default) — prints structured output to stdout
- **`json`** — writes JSON files to `OUTPUT_DIR` (default: `./output`)

```bash
OUTPUT_MODE=json python -m worker.main simulate --seed 42
# → output/run-xxxx.json
```

## Configuration

Copy `.env.example` to `.env` and adjust as needed. All settings have sensible defaults for local development.

| Variable | Default | Description |
|---|---|---|
| `ENVIRONMENT` | `development` | Environment name |
| `LOG_LEVEL` | `INFO` | Logging level |
| `OUTPUT_MODE` | `log` | Output mode: `log` or `json` |
| `OUTPUT_DIR` | `./output` | Directory for JSON output files |
| `MODEL_VERSION` | `sa-sim-0.4.2` | Simulation model version |
| `SEED` | *(random)* | Fixed seed for deterministic generation |
| `REDIS_URL` | *(none)* | Redis URL for future job queue |
| `API_BASE_URL` | *(none)* | API URL for future callbacks |

## Testing

```bash
pip install -e ".[dev]"
pytest
```

## Docker

```bash
docker build -t simualpha-worker .
docker run simualpha-worker simulate --seed 42
docker run simualpha-worker replay --date 2025-03-18
```

## Architecture

```
worker/
├── main.py                  # CLI entrypoint
├── core/
│   ├── config.py            # Environment-based settings
│   └── logging.py           # Structured logging
├── schemas/                 # Pydantic domain models (API-aligned)
│   ├── regime.py
│   ├── actor.py
│   ├── scenario.py
│   ├── signal.py
│   ├── replay.py
│   ├── context.py
│   └── system.py
├── generators/              # Domain-specific output generators
│   ├── regime_generator.py
│   ├── actor_generator.py
│   ├── scenario_generator.py
│   ├── signal_generator.py
│   ├── context_generator.py
│   └── replay_generator.py
├── services/                # Orchestration layer
│   ├── simulation_service.py
│   ├── replay_service.py
│   └── job_registry.py
├── jobs/                    # Job definitions
│   ├── simulation_job.py
│   ├── replay_job.py
│   ├── calibration_job.py
│   └── scheduled_jobs.py
└── data/                    # Vocabulary and seed state
    ├── vocab.py
    └── seed_state.py
```

## Where to Add Real Logic

| Component | Current State | Future Integration |
|---|---|---|
| `generators/*.py` | Seeded deterministic generation | Replace with model inference |
| `services/simulation_service.py` | Orchestrates generators | Add market data ingestion |
| `services/replay_service.py` | Synthetic historical frames | Use real historical data from Supabase |
| `jobs/calibration_job.py` | Scaffold only | Add parameter optimization pipeline |
| `jobs/scheduled_jobs.py` | Declarative schedule | Wire to APScheduler or Redis-based scheduler |
| `services/job_registry.py` | In-memory tracking | Persist to Supabase |
| `data/vocab.py` | Static vocabulary | May remain static or become model-derived |
