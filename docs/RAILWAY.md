# Railway feed worker

The worker pulls headlines from every source (news RSS/Atom feeds, YouTube channels and
podcasts) and hands them to Supabase. Grok then sorts them through `producer_digest()`.
It runs as a **Railway cron job** every 20 minutes and exits when it's done, so you only pay
for about a minute of compute per run.

```
Railway worker  ──(publishable key + ingest token)──▶  Supabase  ◀── website (Cloudflare)
   pulls feeds                                          stores, dedupes   ◀── Grok (sorts)
```

- **No admin key on Railway.** The worker uses the public publishable key plus an
  **ingest token** that can only call `worker_sources()` and `worker_report()`. A leaked token
  can add headlines, nothing else. Revoke it on the Sources page.
- **Fallback.** While the worker has run in the last 60 minutes, the database's own fetcher
  stays idle. If the worker stops, the database takes over automatically.
- **What it adds over the database fetcher:**
  - Paste a YouTube channel link or `@handle`, or a podcast name or Apple Podcasts link, and
    the worker finds the feed.
  - Follows redirects, and skips feeds that haven't changed since the last run.
  - Records video views and thumbnails, plus podcast duration, audio and transcript links.
  - Skips YouTube Shorts.

## Setup (one time)

The Railway service is connected to this repo's `main` branch. Railway builds the repo root
(`package.json` → `worker/`) and reads `railway.json` for the start command and the
`*/20 * * * *` schedule.

1. **Create the token.** On the site, go to **Feed → Sources → Railway worker → Create
   worker token**, then **Copy all three**. The token is shown only once.
2. **Add the variables.** In Railway, open the service, go to **Variables → Raw Editor**,
   paste, then click **Update Variables**:
   ```
   SUPABASE_URL=https://olzqrpbwayzqyvjeotvz.supabase.co
   SUPABASE_KEY=<publishable key, already filled in by the copy button>
   INGEST_TOKEN=ta_ingest_…
   ```
3. **Deploy.** Railway redeploys after the variable change; if it doesn't, use
   **Deployments → Redeploy**. Then check **Settings → Cron Schedule**: it should read
   `*/20 * * * *`. If Railway left the service as an always-on app, set the schedule there by hand.
4. **Check it worked.** The run's logs end with `done in …s: +N new, …`. The Sources page
   then says **"Railway worker is fetching"**.

No public domain or networking is needed, since the worker only makes outgoing requests.
Cloudflare isn't involved: it serves the website, and both the website and the worker talk
only to Supabase.

## Day to day

- **Adding sources:** on the Sources page, choose *News / blog feed*, *YouTube channel* or
  *Podcast*. YouTube links and podcast names show **"finding feed"** until the next worker run.
- **Logs:** each run prints one line per source (`ok`/`ERR`, new count) and a summary.
- **Rotating the token:** create a new one, paste it into Railway, then **Revoke all** on the
  Sources page. Revoke removes every token, so create the new one again afterwards.
- **Pausing the worker:** remove its cron schedule in Railway, or revoke the token. The
  database fetcher resumes within an hour.

## Local development

```bash
npm install
npm test                                   # parser / resolver tests on real feed samples
SUPABASE_URL=… SUPABASE_KEY=… INGEST_TOKEN=… npm start
```
