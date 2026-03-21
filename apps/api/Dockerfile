FROM python:3.11-slim AS base

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev && rm -rf /var/lib/apt/lists/*

# Copy the worker package first (local dependency)
COPY apps/worker /app/apps/worker

# Copy the api app
COPY apps/api /app/apps/api

# Install worker then api
RUN pip install --no-cache-dir /app/apps/worker && \
    pip install --no-cache-dir /app/apps/api

WORKDIR /app/apps/api

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
