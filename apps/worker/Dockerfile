FROM python:3.11-slim AS base

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir .

COPY worker/ worker/

ENV ENVIRONMENT=production
ENV LOG_LEVEL=INFO
ENV OUTPUT_MODE=log

ENTRYPOINT ["python", "-m", "worker.main"]
CMD ["simulate"]
