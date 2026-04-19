"""End-to-end MCP stdio smoke test for render_tli_chart.

Spawns scripts/_mcp_stub_server.py as the MCP server (stdio transport),
issues a tools/list and a tools/call for render_tli_chart with the HIMS
fixture, and verifies:

1. The server returns a TextContent with a JSON payload containing a URL.
2. The URL is reachable as a file (the stub writes to a temp dir).
3. The PNG signature is valid.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]


async def run() -> int:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    fixture = json.loads((ROOT / "docs/examples/hims_wave2_confluence.json").read_text())

    params = StdioServerParameters(
        command=sys.executable,
        args=[str(ROOT / "scripts/_mcp_stub_server.py")],
        env={"PYTHONPATH": str(ROOT / "src"), "MPLBACKEND": "Agg"},
    )

    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            tool_list = await session.list_tools()
            names = sorted(t.name for t in tool_list.tools)
            print(f"[mcp] tools advertised: {names}")
            assert "render_tli_chart" in names, "render_tli_chart not in tool list"

            print("[mcp] calling render_tli_chart with HIMS fixture …")
            result = await session.call_tool("render_tli_chart", arguments=fixture)
            assert result.content, "no content in tool result"
            text = result.content[0].text
            payload = json.loads(text)
            print(f"[mcp] response payload keys: {sorted(payload.keys())}")

            url = payload["url"]
            assert url, "empty url in response"
            print(f"[mcp] returned url: {url}")
            print(f"[mcp] cached={payload['cached']} hash={payload['hash']} "
                  f"width={payload['width']} height={payload['height']}")

            parsed = urlparse(url)
            assert parsed.scheme == "file", f"expected file:// (stub); got {parsed.scheme}"
            png_path = Path(parsed.path)
            assert png_path.exists(), f"PNG missing on disk: {png_path}"
            blob = png_path.read_bytes()
            assert blob.startswith(b"\x89PNG\r\n\x1a\n"), "not a valid PNG"
            print(f"[mcp] PNG verified — {png_path} ({len(blob)} bytes)")
            return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run()))
