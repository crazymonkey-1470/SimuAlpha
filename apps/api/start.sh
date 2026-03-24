#!/bin/sh
set -e

echo "=== SimuAlpha API Startup ==="

# Run database migrations
echo "Running database migrations..."
python -m alembic upgrade head 2>&1 || echo "WARNING: Migrations failed (DB may be unreachable). Continuing with create_all fallback."

# Start the API server
echo "Starting uvicorn on port ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
