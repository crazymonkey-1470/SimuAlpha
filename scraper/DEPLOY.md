# Scraper Service Deployment to Railway

## Overview

The TLI Scraper Service is a FastAPI-based microservice that fetches financial data from Polygon.io. It needs to be deployed as a separate Railway service so the backend's Stage 2 pipeline can call it.

## Prerequisites

- The main SimuAlpha backend is already deployed on Railway
- You have write access to the Railway project
- You have the `POLYGON_API_KEY` environment variable available

## Deployment Steps

### 1. Create a New Railway Service

1. Go to your Railway project dashboard
2. Click **+ New** → **Service**
3. Select **Deploy from GitHub**
4. Choose the SimuAlpha repository
5. In **Root Directory**, set: `scraper/`
6. Click **Deploy**

### 2. Configure Environment Variables

Once the service is deployed:

1. Open the scraper service settings
2. Go to the **Variables** tab
3. Add the following environment variables:

| Variable | Value |
|----------|-------|
| `POLYGON_API_KEY` | *Your Polygon.io API key* |
| `PORT` | `8000` (optional, Railway sets this automatically) |

### 3. Get the Service URL

1. In the scraper service, go to the **Settings** tab
2. Look for the **Public URL** (format: `https://scraper-xxxxx.up.railway.app`)
3. Copy this URL

### 4. Update Backend Configuration

1. Open the **main backend service** settings
2. Go to the **Variables** tab
3. Add or update:

| Variable | Value |
|----------|-------|
| `SCRAPER_URL` | *Paste the scraper service URL from step 3* |

Example: `SCRAPER_URL=https://scraper-xxxxx.up.railway.app`

4. Click **Redeploy** on the backend service to apply the change

## Verification

Once deployed, verify the scraper service is running:

### Check Health Endpoint

```bash
curl https://scraper-xxxxx.up.railway.app/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "TLI Scraper",
  "polygon_key_set": true
}
```

### Test a Data Endpoint

```bash
curl https://scraper-xxxxx.up.railway.app/fundamentals/AAPL
```

Expected response (sample):
```json
{
  "ticker": "AAPL",
  "company_name": "Apple Inc.",
  "current_price": 150.25,
  "market_cap": 2300000000000,
  "revenue_current": 383285000000,
  "revenue_growth_pct": 3.2,
  ...
}
```

### View Logs

Monitor the scraper logs in Railway:

1. Open the scraper service
2. Click the **Logs** tab
3. Check for any startup errors or API failures

## Troubleshooting

### Service won't start

- Check that `POLYGON_API_KEY` is set in environment variables
- View the service logs for Python/FastAPI startup errors
- Ensure the Dockerfile and requirements.txt are intact

### API calls return 401/403

- Verify `POLYGON_API_KEY` is correct and has appropriate scopes
- Check Polygon.io account for rate limits or API key expiration

### Backend Stage 2 still skips

- Verify `SCRAPER_URL` is set on the backend service (not localhost)
- Check that the scraper service URL is correct (copy-paste from Railway)
- Ensure the scraper service is running (check health endpoint)

## Monitoring

The scraper service includes:
- **Health check endpoint** at `/health` (checked every 30s by Railway)
- **Automatic restart on failure** (Railway restarts up to 3 times)
- **Structured logging** to Railway's log stream

## Next Steps

After deployment:

1. Monitor the backend logs as Stage 2 begins processing the universe
2. Check scraper logs if you see high error rates in Stage 2
3. Adjust `POLYGON_API_KEY` rate limits if needed for scale-up

## Support

For issues:
- Review Railway's service logs first
- Check Polygon.io API status and documentation
- Verify all environment variables are correct and non-empty
