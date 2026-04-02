import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });
import cors from 'cors';
import { scanRouter } from './routes/scan.js';
import { resultsRouter } from './routes/results.js';
import { tickerRouter } from './routes/ticker.js';
import { watchlistRouter } from './routes/watchlist.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'The Long Screener API', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api', scanRouter);
app.use('/api', resultsRouter);
app.use('/api', tickerRouter);
app.use('/api', watchlistRouter);

app.listen(PORT, () => {
  console.log(`[TLI] Server running on port ${PORT}`);
});
