"""TLI chart renderer — STAGE 2 STUB (not implemented).

The full implementation will render a SimuAlpha TLI-style chart using
mplfinance, sourcing OHLCV from prices_daily and overlaying:

- Blue horizontal support/resistance lines
- Green flip lines (bullish regime change), red flip lines (bearish)
- Yellow 200-period SMA
- Green circles on wave lows, red circles on wave highs
- Fibonacci retracement overlay (0.236, 0.382, 0.5, 0.618, 0.786)

TODO (Stage 2):
- [ ] Add `render_tli_chart(ticker, start, end, out_path)` entry point.
- [ ] Pull OHLCV from Supabase prices_daily (sort ascending by date).
- [ ] Compute 200-period SMA (and 200-week MA when timeframe warrants).
- [ ] Accept S/R levels, flip lines, and wave annotations as structured
      inputs (later pulled from research/ output; hard-coded for now).
- [ ] Use mplfinance `make_addplot` + `alines` for horizontal S/R (blue),
      flip lines (green/red), and the 200 SMA (yellow).
- [ ] Annotate wave turning points with scatter markers — green circles
      on wave lows (2, 4, B), red circles on wave highs (1, 3, 5, A, C).
- [ ] Build Fibonacci overlay: compute levels from the current Wave 1 high
      / Wave 2 low (configurable), draw as dashed horizontal lines.
- [ ] Output PNG to a Supabase Storage bucket (TBD name, e.g.
      `tli-charts`) and record the public URL on `screener_results` or a
      new `tli_charts` table.
- [ ] Expose CLI: `python -m simualpha_quant.cli render-chart --ticker HIMS`.
- [ ] Golden-image test against a reference chart for HIMS sample data.

Do NOT implement until Stage 2 begins.
"""

from __future__ import annotations


def render_tli_chart(*args, **kwargs):
    raise NotImplementedError(
        "TLI chart renderer is a Stage 2 deliverable; not implemented yet."
    )
