import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

import express from 'express';
import cors from 'cors';
import { scanRouter } from './routes/scan.js';
import { resultsRouter } from './routes/results.js';
import { tickerRouter } from './routes/ticker.js';
import { watchlistRouter } from './routes/watchlist.js';

const app = express();
const PORT = process.env.PORT || 3001;

// CORS — allow Cloudflare Pages, local dev, and production domain
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Allow requests with no origin (server-to-server, curl, health checks)
    if (!origin) return callback(null, true);
    // Allow Cloudflare Pages preview URLs
    if (origin.endsWith('.pages.dev')) return callback(null, true);
    // Allow explicitly listed origins
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

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
