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

# Default command prints help. Override in Railway cron config, e.g.:
#
#   [deploy.cron]
#   schedule = "0 6 * * 1-5"   # weekdays 06:00 UTC
#   command  = "python -m simualpha_quant.cli fetch-prices --tickers HIMS,NKE"
#
#   [deploy.cron]
#   schedule = "0 7 * * 1"     # Mondays 07:00 UTC
#   command  = "python -m simualpha_quant.cli fetch-fundamentals --tickers HIMS,NKE"
CMD ["python", "-m", "simualpha_quant.cli", "--help"]
