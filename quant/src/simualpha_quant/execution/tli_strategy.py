"""TLI strategy for freqtrade — STAGE 4 STUB (not implemented).

Wraps the TLI signal system as a freqtrade `IStrategy`, driven by a
5-tranche DCA schedule (10%, 15%, 20%, 25%, 30%) implemented via
`adjust_trade_position`.

TODO (Stage 4):
- [ ] Subclass `freqtrade.strategy.IStrategy` as `TLIStrategy`.
- [ ] Pull TLI signals from research/qlib_adapter output (or directly from
      screener_results) into the strategy dataframe via `populate_indicators`.
- [ ] Implement entry logic in `populate_entry_trend`: enter when TLI
      composite crosses into the ACCUMULATE zone with 200WMA/MMA
      confluence and a Wave 2 / Wave 4 pullback confirmed.
- [ ] Implement exit logic in `populate_exit_trend`: wave-5 completion,
      break below flip line, or fundamental deterioration.
- [ ] Enable `position_adjustment_enable = True` and implement
      `adjust_trade_position` with the 5-tranche DCA schedule:
         tranche 1 (initial)  : 10%
         tranche 2 (pullback) : 15%
         tranche 3 (support)  : 20%
         tranche 4 (reclaim)  : 25%
         tranche 5 (breakout) : 30%
      Total stake across the 5 tranches = 100% of allocated position.
- [ ] Respect `max_entry_position_adjustment = 4` (initial + 4 DCA adds).
- [ ] Add `confirm_trade_entry` / `confirm_trade_exit` hooks for final
      TLI-signal sanity checks.
- [ ] Backtesting: config pointing at our exported Supabase-driven
      OHLCV. Validate against a reference TLI universe for last 3 years.
- [ ] CLI: `python -m simualpha_quant.cli validate-strategy` that shells
      out to `freqtrade backtesting` with our config.

When implemented, register the agent-facing tool (likely
`simulate_strategy`) in `simualpha_quant.tools.registry.TOOLS`.

Do NOT implement until Stage 4 begins.
"""

from __future__ import annotations


class TLIStrategy:
    """Placeholder for the Stage 4 freqtrade IStrategy subclass."""

    def __init__(self, *args, **kwargs):
        raise NotImplementedError(
            "TLIStrategy is a Stage 4 deliverable; not implemented yet."
        )
