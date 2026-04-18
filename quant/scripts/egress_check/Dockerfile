# Minimal image for the Railway egress check (Stage 4.5 follow-up).
# Installs both requirements files because we need freqtrade.
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy only what the diagnostic needs — both requirements files plus
# the simualpha_quant source tree.
COPY requirements.txt requirements-stage4.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-stage4.txt

COPY src ./src
COPY scripts ./scripts

ENV PYTHONPATH=/app/src
ENV PYTHONUNBUFFERED=1

CMD ["python", "scripts/egress_check/run.py"]
