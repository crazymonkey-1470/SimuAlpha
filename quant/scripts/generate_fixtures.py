"""Render reference PNGs for the visual regression suite.

Run once locally (after `pip install -r requirements.txt`) before
enabling the visual regression tests. Writes to docs/examples/ alongside
the JSON specs.

    python scripts/generate_fixtures.py

The renderer is fed a deterministic synthetic price series so we don't
need Supabase or OpenBB credentials to generate the reference PNGs.
That series matches the one used in tests/charts/test_visual_regression.py.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from datetime import timedelta  # noqa: E402

import pandas as pd  # noqa: E402

from simualpha_quant.charts import tli_renderer  # noqa: E402
from simualpha_quant.schemas.charts import RenderChartRequest  # noqa: E402

EXAMPLES = ROOT / "docs" / "examples"


def _synthetic_prices_for(ticker: str) -> pd.DataFrame:
    idx = pd.date_range("2024-01-01", periods=240, freq="B")
    seed = sum(ord(c) for c in ticker)
    base = 15.0 + (seed % 10)
    return pd.DataFrame(
        {
            "open":  [base + 0.04 * i + (i % 9) * 0.1 for i in range(240)],
            "high":  [base + 0.04 * i + 0.7 for i in range(240)],
            "low":   [base + 0.04 * i - 0.7 for i in range(240)],
            "close": [base + 0.04 * i + (i % 5) * 0.08 for i in range(240)],
            "volume": [1_500_000 + i * 2_000 for i in range(240)],
        },
        index=idx,
    )


def _patch_loader() -> None:
    tli_renderer._load_prices = lambda ticker, start, end: _synthetic_prices_for(ticker)


def _constrain_request(req: RenderChartRequest) -> RenderChartRequest:
    """Align the request window with the synthetic series to avoid no-data errors."""
    start = pd.Timestamp("2024-01-01").date()
    end = (pd.Timestamp("2024-01-01") + timedelta(days=240)).date()
    return req.model_copy(update={"date_range": req.date_range.model_copy(update={"start": start, "end": end})})


def main() -> int:
    _patch_loader()
    EXAMPLES.mkdir(parents=True, exist_ok=True)
    fixtures = sorted(EXAMPLES.glob("*.json"))
    if not fixtures:
        print(f"no fixtures found under {EXAMPLES}", file=sys.stderr)
        return 1

    for spec in fixtures:
        payload = json.loads(spec.read_text())
        req = RenderChartRequest.model_validate(payload)
        req = _constrain_request(req)
        png = tli_renderer.render(req)
        out = spec.with_suffix(".png")
        out.write_bytes(png)
        print(f"wrote {out.relative_to(ROOT)} ({len(png)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
