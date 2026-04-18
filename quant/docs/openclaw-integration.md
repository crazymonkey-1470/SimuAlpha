# OpenClaw integration guide

This service exposes capabilities for OpenClaw to call. OpenClaw never
runs inside the quant service.

Two equivalent transports: **HTTP** (FastAPI) and **MCP** (stdio or SSE).
Both expose the same tools from the same registry.

## Provision a key

Mint a scoped key once per caller (OpenClaw, CI, another internal agent):

```bash
cd backend
node scripts/generate_api_key.js "OpenClaw" quant:tools
# prints the raw token exactly once — save it
```

That token is the value OpenClaw sends as `Authorization: Bearer …`.

## Break-glass

Before a Supabase key is minted, set `QUANT_SERVICE_BOOTSTRAP_TOKEN` in
the quant service environment. Match that value verbatim in
`Authorization: Bearer …` — a warning is logged every time this path is
taken, so don't leave it set in production.

## HTTP (FastAPI)

Base URL (Railway private networking):
`http://quant-api.railway.internal:8000`

Base URL (public, if exposed): whatever Railway-generated domain the
`quant-api` service has.

Response envelope matches the Node backend:
```json
{ "success": true, "data": <tool result>, "meta": { "timestamp": "…", "tool": "…", "elapsed_ms": 42 } }
```

Failures:
```json
{ "success": false, "error": "…", "details": <optional>, "meta": { "timestamp": "…" } }
```

### `POST /v1/tools/price-history`

```bash
curl -s https://quant-api.example.com/v1/tools/price-history \
  -H "Authorization: Bearer $OPENCLAW_QUANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "HIMS",
    "start": "2023-01-01",
    "end":   "2024-12-31"
  }'
```

### `POST /v1/tools/fundamentals`

```bash
curl -s https://quant-api.example.com/v1/tools/fundamentals \
  -H "Authorization: Bearer $OPENCLAW_QUANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "NKE",
    "metrics": ["revenue", "ebitda", "free_cash_flow"]
  }'
```

Omit `metrics` to receive all TLI-scoring metrics (revenue, ebitda,
free_cash_flow, shares_outstanding, total_debt, cash, gross_margin,
operating_margin, net_income).

### Introspection

```bash
curl -s https://quant-api.example.com/v1/tools \
  -H "Authorization: Bearer $OPENCLAW_QUANT_TOKEN"
```

Returns the registered tools with their JSON request/response schemas.

### Health

```bash
curl -s https://quant-api.example.com/health
```

## MCP

Same tools, MCP protocol. Useful when OpenClaw (or Claude Code / Claude
Desktop for local dev) consumes tools via MCP rather than HTTP.

### SSE transport (Railway / production)

Server command (already baked into `railway.mcp.json`):
```
python -m simualpha_quant.mcp.server --transport sse --host 0.0.0.0 --port $PORT
```

Client config (Claude Desktop, OpenClaw, or any MCP client):
```json
{
  "mcpServers": {
    "simualpha-quant": {
      "transport": "sse",
      "url": "https://quant-mcp.example.com/sse"
    }
  }
}
```

### stdio transport (local dev)

Client config:
```json
{
  "mcpServers": {
    "simualpha-quant": {
      "command": "python",
      "args": ["-m", "simualpha_quant.mcp.server"],
      "cwd": "/path/to/SimuAlpha/quant",
      "env": {
        "PYTHONPATH": "src",
        "SUPABASE_URL": "…",
        "SUPABASE_SERVICE_KEY": "…",
        "OPENBB_PAT": "…"
      }
    }
  }
}
```

### Tool names

- `get_price_history` — input: `{ticker, start, end, timeframe="daily"}`
- `get_fundamentals`  — input: `{ticker, metrics?: [string]}`

Output shapes: whatever the Pydantic models in `simualpha_quant.schemas.*`
return, serialized as a JSON string inside an MCP `TextContent` block.

## Adding a new tool

1. Implement the pure function in `src/simualpha_quant/tools/<name>.py`.
2. Add Pydantic v2 request/response models to
   `src/simualpha_quant/schemas/`.
3. Append a `ToolSpec` to `TOOLS` in
   `src/simualpha_quant/tools/registry.py`.
4. Don't touch the HTTP or MCP layers — they will pick the tool up
   automatically on next start.
