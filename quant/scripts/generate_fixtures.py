"""Render reference PNGs for the visual regression suite.

Run once locally (after installing the chart deps) before enabling the
visual regression tests. Writes to docs/examples/ alongside the JSON
specs.

    python scripts/generate_fixtures.py

The renderer is fed a per-fixture deterministic synthetic price series
calibrated from each fixture's own annotations (see
`scripts/_synthetic.py`), so reference PNGs match the test fixtures
exactly without needing Supabase or OpenBB credentials.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
SCRIPTS = ROOT / "scripts"
for p in (str(SRC), str(SCRIPTS)):
    if p not in sys.path:
        sys.path.insert(0, p)

import os  # noqa: E402

os.environ.setdefault("MPLBACKEND", "Agg")

from _synthetic import synthetic_for  # noqa: E402

from simualpha_quant.charts import tli_renderer  # noqa: E402
from simualpha_quant.schemas.charts import RenderChartRequest  # noqa: E402

EXAMPLES = ROOT / "docs" / "examples"


def _patch_loader_for(req: RenderChartRequest) -> None:
    df = synthetic_for(req)
    tli_renderer._load_prices = lambda ticker, start, end: df


def main() -> int:
    EXAMPLES.mkdir(parents=True, exist_ok=True)
    fixtures = sorted(EXAMPLES.glob("*.json"))
    if not fixtures:
        print(f"no fixtures found under {EXAMPLES}", file=sys.stderr)
        return 1

    for spec in fixtures:
        payload = json.loads(spec.read_text())
        req = RenderChartRequest.model_validate(payload)
        _patch_loader_for(req)
        png = tli_renderer.render(req)
        out = spec.with_suffix(".png")
        out.write_bytes(png)
        print(f"wrote {out.relative_to(ROOT)} ({len(png)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
