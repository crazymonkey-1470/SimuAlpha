"""MCP server exposing the same tool registry as the HTTP API.

Single implementation, two launch modes:

- stdio (default): `python -m simualpha_quant.mcp.server`
  Intended for local dev and Claude Code / Claude Desktop integration.

- sse: `python -m simualpha_quant.mcp.server --transport sse --host 0.0.0.0 --port 8765`
  Intended for Railway deployment. OpenClaw connects over HTTP/SSE.

Tool handlers wrap `simualpha_quant.tools.registry.TOOLS` — no business
logic lives here.
"""

from __future__ import annotations

import argparse
import asyncio
import json

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

from simualpha_quant.logging_config import configure_logging, get_logger
from simualpha_quant.tools.registry import TOOLS, by_name

configure_logging()
log = get_logger(__name__)

SERVER_NAME = "simualpha-quant"
SERVER_VERSION = "0.1.0"


def build_server() -> Server:
    server: Server = Server(SERVER_NAME, version=SERVER_VERSION)

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        return [
            Tool(
                name=spec.mcp_name,
                description=spec.description,
                inputSchema=spec.request_model.model_json_schema(),
            )
            for spec in TOOLS
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict) -> list[TextContent]:
        spec = by_name(name)
        log.info("mcp tool call", extra={"tool": spec.name})
        req = spec.request_model.model_validate(arguments or {})
        try:
            result = spec.handler(req)
        except Exception as exc:
            log.exception("mcp tool handler failed", extra={"tool": spec.name})
            raise RuntimeError(f"{spec.name} failed: {exc}") from exc
        payload = result.model_dump(mode="json")
        return [TextContent(type="text", text=json.dumps(payload, default=str))]

    return server


async def _run_stdio() -> None:
    server = build_server()
    async with stdio_server() as (read, write):
        init_opts = server.create_initialization_options()
        log.info("mcp stdio server starting", extra={"tools": [t.name for t in TOOLS]})
        await server.run(read, write, init_opts)


def _run_sse(host: str, port: int) -> None:
    # Lazy import — only needed when running the SSE transport.
    import uvicorn
    from mcp.server.sse import SseServerTransport
    from starlette.applications import Starlette
    from starlette.responses import JSONResponse
    from starlette.routing import Mount, Route

    server = build_server()
    sse = SseServerTransport("/messages/")

    async def handle_sse(request):
        async with sse.connect_sse(request.scope, request.receive, request._send) as streams:
            await server.run(streams[0], streams[1], server.create_initialization_options())

    async def health(_request):
        return JSONResponse(
            {"status": "ok", "service": SERVER_NAME, "tools": [t.name for t in TOOLS]}
        )

    app = Starlette(
        debug=False,
        routes=[
            Route("/health", health, methods=["GET"]),
            Route("/sse", handle_sse, methods=["GET"]),
            Mount("/messages/", app=sse.handle_post_message),
        ],
    )

    log.info(
        "mcp sse server starting",
        extra={"host": host, "port": port, "tools": [t.name for t in TOOLS]},
    )
    uvicorn.run(app, host=host, port=port, log_level="info")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="simualpha-quant-mcp",
        description="SimuAlpha quant MCP server (stdio or SSE)",
    )
    parser.add_argument("--transport", choices=("stdio", "sse"), default="stdio")
    parser.add_argument("--host", default="0.0.0.0", help="SSE host (ignored for stdio)")
    parser.add_argument("--port", type=int, default=8765, help="SSE port (ignored for stdio)")
    args = parser.parse_args(argv)

    if args.transport == "stdio":
        asyncio.run(_run_stdio())
    else:
        _run_sse(args.host, args.port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
