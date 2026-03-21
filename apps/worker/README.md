# SimuAlpha Worker

Background worker service for simulations, scheduled tasks, and job processing.

## Local Development

```bash
cd apps/worker

# Create virtual environment
python -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -e ".[dev]"

# Run the worker
python -m worker.main
```

## Docker

```bash
docker build -t simualpha-worker .
docker run simualpha-worker
```
