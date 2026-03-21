# SimuAlpha API

FastAPI backend service for SimuAlpha.

## Local Development

```bash
cd apps/api

# Create virtual environment
python -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -e ".[dev]"

# Run the development server
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.

- Swagger docs: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- Health check: `http://localhost:8000/health`

## Docker

```bash
docker build -t simualpha-api .
docker run -p 8000:8000 simualpha-api
```
