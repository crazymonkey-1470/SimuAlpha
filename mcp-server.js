#!/usr/bin/env node
'use strict';

/**
 * SimuAlpha MCP Server
 *
 * Exposes SimuAlpha intelligence endpoints as MCP tools so Claude Code
 * (and any other MCP-compatible client) can call them natively.
 *
 * Usage:
 *   node mcp-server.js
 *
 * Configure in Claude Code's MCP settings:
 *   {
 *     "mcpServers": {
 *       "simualpha": {
 *         "command": "node",
 *         "args": ["/path/to/SimuAlpha/mcp-server.js"],
 *         "env": {
 *           "SIMUALPHA_API_URL": "https://your-railway-url.up.railway.app",
 *           "SIMUALPHA_API_KEY": "optional-admin-key"
 *         }
 *       }
 *     }
 *   }
 */

const readline = require('readline');

const BASE_URL = (process.env.SIMUALPHA_API_URL || '').replace(/\/$/, '');
const API_KEY  = process.env.SIMUALPHA_API_KEY || '';

if (!BASE_URL) {
  process.stderr.write('ERROR: SIMUALPHA_API_URL is required\n');
  process.exit(1);
}

// ── Minimal fetch wrapper ─────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['x-admin-key'] = API_KEY;

  const url = `${BASE_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(url, { ...opts, headers: { ...headers, ...opts.headers }, signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
    return data;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ── Tool definitions ──────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'analyze_stock',
    description: 'Ask the SimuAlpha AI brain to analyze a stock using TLI Elliott Wave methodology. Returns wave position, signal tier, entry price, fib target, confidence and reasoning.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt:  { type: 'string', description: 'What you want to know, e.g. "Analyze NVDA wave position and give entry levels"' },
        ticker:  { type: 'string', description: 'Optional ticker symbol, e.g. NVDA' },
        mode:    { type: 'string', enum: ['analysis', 'signal', 'risk', 'explain'], description: 'Analysis mode (default: analysis)' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'get_market_state',
    description: 'Get the current macro market state: VIX level, regime (bull/bear/ranging), breadth %, SPY wave position, and leading sectors.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_top_signals',
    description: 'Get today\'s top 10 stock signals ranked by TLI score. Returns ticker, score, tier (LOAD_THE_BOAT etc), entry price, and fib target.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_risk_assessment',
    description: 'Get position sizing and risk parameters for a specific ticker: ATR, stop loss, max position size, Kelly fraction, DCA tranches.',
    inputSchema: {
      type: 'object',
      properties: {
        ticker:         { type: 'string', description: 'Ticker symbol, e.g. AAPL' },
        portfolio_size: { type: 'number', description: 'Portfolio size in USD for position sizing (default: 100000)' },
      },
      required: ['ticker'],
    },
  },
  {
    name: 'get_backtest_results',
    description: 'Get historical backtest performance by signal tier and entry setup combination. Shows win rates, avg returns, Sharpe ratio.',
    inputSchema: {
      type: 'object',
      properties: {
        tier: { type: 'string', description: 'Signal tier to filter by, e.g. LOAD_THE_BOAT (optional)' },
      },
    },
  },
  {
    name: 'get_signal_outcomes',
    description: 'Get recent signal outcomes: which signals won/lost, returns, hold times. Used to assess signal accuracy and learn from results.',
    inputSchema: {
      type: 'object',
      properties: {
        days:   { type: 'number', description: 'Look back N days (default: 30)' },
        status: { type: 'string', enum: ['won', 'lost', 'open'], description: 'Filter by outcome status (optional)' },
      },
    },
  },
  {
    name: 'get_factor_accuracy',
    description: 'Get accuracy and weight for each scoring factor (e.g. confluence, institutional overlap, wave position). Shows what\'s working.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ── Tool handlers ─────────────────────────────────────────────────────────────
async function callTool(name, args) {
  switch (name) {

    case 'analyze_stock': {
      const data = await apiFetch('/api/agent/query', {
        method: 'POST',
        body: JSON.stringify({
          prompt: args.prompt,
          context: args.ticker ? { ticker: args.ticker.toUpperCase() } : undefined,
          mode: args.mode || 'analysis',
        }),
      });
      return data;
    }

    case 'get_market_state': {
      return await apiFetch('/api/intelligence/current-market-state');
    }

    case 'get_top_signals': {
      return await apiFetch('/api/intelligence/top-signals-today');
    }

    case 'get_risk_assessment': {
      const ticker = args.ticker.toUpperCase();
      const qs = args.portfolio_size ? `?portfolioSize=${args.portfolio_size}` : '';
      return await apiFetch(`/api/intelligence/risk-assessment/${ticker}${qs}`);
    }

    case 'get_backtest_results': {
      const qs = args.tier ? `?tier=${encodeURIComponent(args.tier)}` : '';
      return await apiFetch(`/api/intelligence/backtest-by-setup${qs}`);
    }

    case 'get_signal_outcomes': {
      const params = new URLSearchParams();
      if (args.days)   params.set('days', String(args.days));
      if (args.status) params.set('status', args.status);
      const qs = params.toString() ? `?${params}` : '';
      return await apiFetch(`/api/intelligence/signal-outcomes${qs}`);
    }

    case 'get_factor_accuracy': {
      return await apiFetch('/api/intelligence/factor-accuracy');
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── MCP JSON-RPC handler ──────────────────────────────────────────────────────
async function handleRequest(req) {
  const { id, method, params } = req;

  try {
    switch (method) {

      case 'initialize':
        return {
          jsonrpc: '2.0', id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'simualpha', version: '1.0.0' },
          },
        };

      case 'tools/list':
        return {
          jsonrpc: '2.0', id,
          result: { tools: TOOLS },
        };

      case 'tools/call': {
        const { name, arguments: args = {} } = params;
        const result = await callTool(name, args);
        return {
          jsonrpc: '2.0', id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            isError: false,
          },
        };
      }

      default:
        return {
          jsonrpc: '2.0', id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
  } catch (err) {
    return {
      jsonrpc: '2.0', id,
      error: { code: -32603, message: err.message },
    };
  }
}

// ── stdio transport ───────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let req;
  try {
    req = JSON.parse(trimmed);
  } catch {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0', id: null,
      error: { code: -32700, message: 'Parse error' },
    }) + '\n');
    return;
  }

  const response = await handleRequest(req);
  process.stdout.write(JSON.stringify(response) + '\n');
});

process.stderr.write(`SimuAlpha MCP server ready — connected to ${BASE_URL}\n`);
