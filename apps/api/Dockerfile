FROM python:3.11-slim AS base

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev && rm -rf /var/lib/apt/lists/*

# Copy the api app
COPY apps/api /app/apps/api

# Install api
RUN pip install --no-cache-dir /app/apps/api

WORKDIR /app/apps/api

EXPOSE 8000

CMD ["sh", "start.sh"]
