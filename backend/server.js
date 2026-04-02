require('dotenv').config();
const express = require('express');
const { runScan, startCron } = require('./cron');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[TLI] Server listening on port ${PORT}`);

  // Start the cron schedule
  startCron();

  // Run an immediate scan on startup
  console.log('[TLI] Running initial scan on startup...');
  runScan().catch((err) => console.error('[TLI] Initial scan error:', err));
});
