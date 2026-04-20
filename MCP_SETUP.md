# SimuAlpha MCP Server

Connects Claude Code directly to the SimuAlpha intelligence backend.
Once configured, Claude Code can call SimuAlpha tools natively in any session.

## Setup

### 1. Open Claude Code MCP settings

In the Claude Code desktop app:
- Cmd/Ctrl + Shift + P → "Open MCP Settings"
- Or edit `~/.claude/claude_desktop_config.json` directly

### 2. Add this config

```json
{
  "mcpServers": {
    "simualpha": {
      "command": "node",
      "args": ["/path/to/SimuAlpha/mcp-server.js"],
      "env": {
        "SIMUALPHA_API_URL": "https://pure-creativity-production-659f.up.railway.app",
        "SIMUALPHA_API_KEY": ""
      }
    }
  }
}
```

Replace `/path/to/SimuAlpha/` with your actual repo path.

### 3. Restart Claude Code

The SimuAlpha tools will appear in Claude Code's tool list.

---

## Available Tools

| Tool | What it does |
|------|-------------|
| `analyze_stock` | Full TLI Elliott Wave analysis for any ticker |
| `get_market_state` | VIX, regime, breadth, SPY wave position |
| `get_top_signals` | Today's top 10 signals by TLI score |
| `get_risk_assessment` | ATR, stop loss, position sizing, Kelly fraction |
| `get_backtest_results` | Win rates by signal tier and entry setup |
| `get_signal_outcomes` | Recent won/lost signals and returns |
| `get_factor_accuracy` | Per-factor accuracy and weights |

---

## Example prompts in Claude Code

```
Use SimuAlpha to analyze NVDA and tell me if it's a buy right now.

What are today's top signals from SimuAlpha?

Get the risk assessment for HIMS with a $50,000 portfolio.

What's the current market regime according to SimuAlpha?

Show me which signal tiers have the best win rates.
```

---

## How it works

```
Claude Code → MCP call → mcp-server.js → SimuAlpha Railway API → Supabase
```

No duplication of logic. The MCP server is a thin wrapper over your existing
intelligence endpoints. When the pipeline runs and populates Supabase,
Claude Code immediately has access to real signal data.
