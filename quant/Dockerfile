# Python 3.12 is required — pandas-ta (a transitive dep of freqtrade)
# dropped Python 3.11 wheels on PyPI. The Stage-4.5 resolver sweep
# confirmed that 3.11 + current openbb + current freqtrade cannot
# coexist without vendoring or private-index workarounds.
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    ca-certificates \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Core install plus Stage 4 (freqtrade + pandas-ta) so simulate_strategy
# is actually callable in this image. The two-file split is preserved so
# a downstream service that only needs the lightweight tools can drop the
# second install — but on the deployed quant-api / quant-mcp services we
# always want both.
COPY requirements.txt requirements-stage4.txt ./
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir -r requirements-stage4.txt

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
