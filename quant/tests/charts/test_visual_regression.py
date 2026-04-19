"""Visual regression against committed reference PNGs.

Default (CI-safe) check: histogram correlation >= SIMILARITY_THRESHOLD,
plus SSIM >= SIMILARITY_THRESHOLD if scikit-image is available. Pixel-
exact diff runs only under --strict-visual for local aesthetic work.

Skips gracefully when the reference PNG hasn't been generated yet
(scripts/generate_fixtures.py is the one-shot generator).
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pytest

from simualpha_quant.charts import tli_renderer
from simualpha_quant.schemas.charts import RenderChartRequest

FIXTURES = Path(__file__).resolve().parents[2] / "docs" / "examples"
SIMILARITY_THRESHOLD = 0.95


def _strict_visual_enabled(request) -> bool:
    return bool(request.config.getoption("--strict-visual", default=False))


def _load_synthetic_for(req: RenderChartRequest) -> pd.DataFrame:
    """Use the same per-fixture calibrated generator that produced the
    committed reference PNGs."""
    import sys
    from pathlib import Path

    scripts = Path(__file__).resolve().parents[2] / "scripts"
    if str(scripts) not in sys.path:
        sys.path.insert(0, str(scripts))
    from _synthetic import synthetic_for

    return synthetic_for(req)


def _hist_similarity(a_bytes: bytes, b_bytes: bytes) -> float:
    import io

    import numpy as np
    from PIL import Image

    a = np.asarray(Image.open(io.BytesIO(a_bytes)).convert("RGB"))
    b = np.asarray(Image.open(io.BytesIO(b_bytes)).convert("RGB"))
    if a.shape != b.shape:
        return 0.0
    ha, _ = np.histogram(a, bins=64, range=(0, 255))
    hb, _ = np.histogram(b, bins=64, range=(0, 255))
    ha = ha.astype(float)
    hb = hb.astype(float)
    if ha.sum() == 0 or hb.sum() == 0:
        return 0.0
    ha /= ha.sum()
    hb /= hb.sum()
    num = float(((ha - ha.mean()) * (hb - hb.mean())).sum())
    den = float((((ha - ha.mean()) ** 2).sum() * ((hb - hb.mean()) ** 2).sum()) ** 0.5)
    return 0.0 if den == 0 else num / den


def _ssim(a_bytes: bytes, b_bytes: bytes) -> float | None:
    try:
        import io

        import numpy as np
        from PIL import Image
        from skimage.metrics import structural_similarity as ssim
    except Exception:
        return None
    a = np.asarray(Image.open(io.BytesIO(a_bytes)).convert("L"))
    b = np.asarray(Image.open(io.BytesIO(b_bytes)).convert("L"))
    if a.shape != b.shape:
        from PIL import Image as _Image

        bimg = _Image.open(io.BytesIO(b_bytes)).convert("L").resize(a.shape[::-1])
        b = np.asarray(bimg)
    return float(ssim(a, b, data_range=255))


def _pixel_exact(a: bytes, b: bytes) -> bool:
    return a == b


@pytest.mark.parametrize(
    "fixture_name",
    ["hims_wave2_confluence", "nke_impossible_level"],
)
def test_visual_regression(request, fixture_name):
    ref = FIXTURES / f"{fixture_name}.png"
    spec = FIXTURES / f"{fixture_name}.json"
    if not spec.exists():
        pytest.skip(f"fixture spec missing: {spec}")
    if not ref.exists():
        pytest.skip(f"reference PNG missing: {ref} — run scripts/generate_fixtures.py")

    req = RenderChartRequest.model_validate_json(spec.read_text())
    df = _load_synthetic_for(req)
    request.addfinalizer(lambda: None)
    original_loader = tli_renderer._load_prices
    tli_renderer._load_prices = lambda ticker, start, end: df
    try:
        rendered = tli_renderer.render(req)
    finally:
        tli_renderer._load_prices = original_loader
    reference = ref.read_bytes()

    if _strict_visual_enabled(request):
        assert _pixel_exact(rendered, reference), "strict pixel-exact mismatch"
        return

    hist = _hist_similarity(rendered, reference)
    assert hist >= SIMILARITY_THRESHOLD, f"histogram similarity {hist:.3f} < {SIMILARITY_THRESHOLD}"

    ssim_score = _ssim(rendered, reference)
    if ssim_score is not None:
        assert ssim_score >= SIMILARITY_THRESHOLD, f"SSIM {ssim_score:.3f} < {SIMILARITY_THRESHOLD}"
