FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    ca-certificates \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONPATH=/app/src
ENV PYTHONUNBUFFERED=1

EXPOSE 8000
EXPOSE 8765

# One image, three launch modes. Pick per Railway service by overriding CMD:
#
#   quant-api (persistent web service; healthcheck /health):
#     uvicorn simualpha_quant.api.app:app --host 0.0.0.0 --port $PORT
#
#   quant-mcp (persistent web service over HTTP/SSE; healthcheck /health):
#     python -m simualpha_quant.mcp.server --transport sse --host 0.0.0.0 --port $PORT
#
#   quant-cron (Railway cron jobs; not a persistent service):
#     python -m simualpha_quant.cli fetch-prices --tickers HIMS,NKE --start 2020-01-01 --end 2025-12-31
#     python -m simualpha_quant.cli fetch-fundamentals --tickers HIMS,NKE
#
# Default CMD prints CLI help — harmless placeholder for local
# `docker run` without overrides.
CMD ["python", "-m", "simualpha_quant.cli", "--help"]
