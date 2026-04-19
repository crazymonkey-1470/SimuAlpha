# Reference fixtures

Each `.json` file here is a real `RenderChartRequest` body. Paired
`.png` is a reference image produced by the renderer for that spec,
used by `tests/charts/test_visual_regression.py`.

## Regenerating the reference PNGs

```bash
cd quant
python scripts/generate_fixtures.py
```

The generator runs the renderer against a deterministic synthetic price
series (same one the test fixture uses), so no Supabase or OpenBB
credentials are required to produce the reference PNGs.

After regenerating, commit the new PNGs alongside the JSON specs. The
visual regression test accepts any render that scores histogram
correlation ≥ 0.95 and (if `scikit-image` is installed) SSIM ≥ 0.95
against the committed reference.

Run with `--strict-visual` for pixel-exact comparison:

```bash
pytest tests/charts/test_visual_regression.py --strict-visual
```

Strict mode is intended for local aesthetic iteration only. CI uses the
perceptual thresholds above.

## Fixtures included

| File | Setup |
| ---- | ----- |
| `hims_wave2_confluence.json` | HIMS at $19.50, Wave 2 at 0.618 Fib, 50-day MA trigger $20.92, Wave 3 target $40.85, Wave 5 target $54.56, 5-tranche DCA (10/15/20/25/30 %). |
| `nke_impossible_level.json`  | NKE $26-39 zone, 0.786 Fib at $39.09, Wave 1 origin $26.70, 200MMA converging, GENERATIONAL BUY badge. |
