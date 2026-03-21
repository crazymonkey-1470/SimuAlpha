# SimuAlpha API

Quantitative market intelligence and simulation API built with FastAPI.

## Local Development

```bash
cd apps/api

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -e ".[dev]"

# Run the development server
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.

- Interactive docs: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- OpenAPI spec: `http://localhost:8000/openapi.json`

## API Endpoints

All endpoints are prefixed with `/api/v1`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | Service health check |
| GET | `/api/v1/system/status` | System status and diagnostics |
| GET | `/api/v1/regime/current` | Current market regime snapshot |
| GET | `/api/v1/regime/history` | Regime classification history |
| GET | `/api/v1/actors/current` | Current actor states and contributions |
| GET | `/api/v1/scenarios/current` | Active scenario branches |
| GET | `/api/v1/signals/current` | Current signal summary |
| GET | `/api/v1/signals/history` | Signal history |
| GET | `/api/v1/context/cross-asset` | Cross-asset market context |
| GET | `/api/v1/replay/{date}` | Historical replay frame for a date |
| POST | `/api/v1/simulation/run` | Submit a simulation run (mock) |

## Project Structure

```
app/
├── api/
│   ├── router.py          # Central API router
│   └── routes/            # Route modules by domain
├── core/
│   ├── config.py          # Settings and environment config
│   └── exceptions.py      # Custom exception handling
├── schemas/               # Pydantic request/response models
├── services/              # Business logic layer
├── data/
│   └── seed.py            # Deterministic seed data
└── main.py                # Application factory
```

## Running Tests

```bash
pytest
```

## Docker

```bash
docker build -t simualpha-api .
docker run -p 8000:8000 simualpha-api
```

## Environment Variables

All settings can be overridden with `SIMUALPHA_` prefixed environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SIMUALPHA_DEBUG` | `false` | Enable debug mode |
| `SIMUALPHA_CORS_ORIGINS` | `["http://localhost:3000"]` | Allowed CORS origins |
| `SIMUALPHA_WORKER_URL` | `http://localhost:8001` | Worker service URL |
