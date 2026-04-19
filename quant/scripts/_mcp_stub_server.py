"""Wrap the real MCP server with stubbed Supabase storage + price loader.

Used only by scripts/mcp_smoke_test.py. Imports the real
simualpha_quant.mcp.server but monkeypatches:

- charts.storage.chart_exists -> always None (force render)
- charts.storage.upload_chart  -> write to /tmp and return file:// URL
- charts.tli_renderer._load_prices -> per-fixture synthetic series
- tools.render_chart._record_index -> no-op

This lets the stdio transport be exercised end-to-end without Supabase.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
SCRIPTS = ROOT / "scripts"
for p in (str(SRC), str(SCRIPTS)):
    if p not in sys.path:
        sys.path.insert(0, p)

os.environ.setdefault("MPLBACKEND", "Agg")

from _synthetic import synthetic_for  # noqa: E402

from simualpha_quant.charts import storage as storage_mod  # noqa: E402
from simualpha_quant.charts import tli_renderer  # noqa: E402
from simualpha_quant.schemas.charts import RenderChartRequest  # noqa: E402
from simualpha_quant.tools import render_chart as render_mod  # noqa: E402


def _patch():
    out_dir = Path(tempfile.gettempdir()) / "simualpha_mcp_smoke"
    out_dir.mkdir(parents=True, exist_ok=True)

    def fake_exists(ticker, timeframe, h):  # noqa: ARG001
        return None

    def fake_upload(ticker, timeframe, h, png):
        out = out_dir / f"{ticker}_{timeframe}_{h}.png"
        out.write_bytes(png)
        return storage_mod.StoredChart(url=f"file://{out}", path=str(out))

    storage_mod.chart_exists = fake_exists
    storage_mod.upload_chart = fake_upload
    render_mod._record_index = lambda req, h, url: None
    render_mod.storage = storage_mod  # ensure reference picked up

    # The price loader is patched lazily: each render_tli_chart call
    # rebuilds the loader for the incoming request.
    original_render = tli_renderer.render

    def render_with_synthetic(req: RenderChartRequest):
        df = synthetic_for(req)
        tli_renderer._load_prices = lambda ticker, start, end: df
        return original_render(req)

    tli_renderer.render = render_with_synthetic


def main() -> int:
    _patch()
    # Run the real stdio entrypoint.
    from simualpha_quant.mcp.server import main as real_main

    return real_main(["--transport", "stdio"])


if __name__ == "__main__":
    raise SystemExit(main())
