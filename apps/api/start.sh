#!/bin/sh
set -e

echo "=== SimuAlpha API Startup ==="

# Run database migrations
echo "Running database migrations..."
python -m alembic upgrade head 2>&1 || echo "WARNING: Migrations failed (DB may be unreachable). Continuing with create_all fallback."

# Seed initial simulation if database is empty
echo "Checking for initial data..."
python -c "
from app.db.session import SessionLocal
from app.db.models import SimulationRun

db = SessionLocal()
try:
    count = db.query(SimulationRun).count()
    if count == 0:
        print('No simulation data found. Running initial seed simulation...')
        from app.services.simulation import run_simulation_sync
        run_simulation_sync(db)
        print('Initial simulation complete.')
    else:
        print(f'Found {count} simulation runs. Skipping seed.')
finally:
    db.close()
" 2>&1 || echo "WARNING: Initial seed failed. API will serve fallback data."

# Start the API server
echo "Starting uvicorn on port ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
