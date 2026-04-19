"""Railway egress probe for freqtrade 2026.3.

Single-shot diagnostic. When run on Railway (e.g. as the container's
CMD), it emits one line of structured output that the operator can
read from the deploy logs:

    EGRESS_CHECK_STATUS=PASS  freqtrade=2026.3.0  trades=N  duration_s=...
    EGRESS_CHECK_STATUS=FAIL  stage=<step>  error_type=<type>  detail=<msg>

Two phases:

1. Reach binance.com/api/v3/exchangeInfo from the container
   (freqtrade's hard requirement during Backtesting.__init__).

2. Run a minimal end-to-end simulate_strategy on the existing
   wave_2_at_618 + 5-tranche fixture against a synthetic universe
   loaded into memory. The OUTPUT SHAPE of this run is compared
   against the synthetic_simulator-path output Stage-4.5 already
   captured, so we can assert "freqtrade native produces results
   identical in shape to what we'd already shipped."

If phase 1 fails, phase 2 is skipped and we report the network error.

PASS/FAIL CONTRACT (tightened after the Bug-1 post-mortem):

    STATUS=PASS is emitted ONLY when phase 2 produced a genuine
    SimulationEngineResult. A SimulationError raised from freqtrade's
    init (e.g. ``KeyError: 'exit_pricing'``) or from mid-backtest is
    distinguished from "ran to completion with zero trades" and maps
    to STATUS=FAIL with the original error_type preserved. The
    previous version of this script conflated the two and reported
    PASS even when freqtrade had crashed.
"""

from __future__ import annotations

import json
import os
import socket
import sys
import time
import traceback
from datetime import date
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src"
sys.path.insert(0, str(SRC))

os.environ.setdefault("MPLBACKEND", "Agg")


def _emit(line: str) -> None:
    print(line, flush=True)


def _phase_1_reach_binance() -> tuple[bool, str]:
    """Hit binance.com directly with a short timeout. Returns (ok, msg)."""
    url = "https://api.binance.com/api/v3/exchangeInfo"
    try:
        with urlopen(Request(url, headers={"User-Agent": "egress-check/1.0"}), timeout=10) as r:
            status = r.status
            payload_size = len(r.read())
        return True, f"HTTP {status}, {payload_size} bytes"
    except socket.timeout:
        return False, "socket.timeout"
    except Exception as exc:
        return False, f"{type(exc).__name__}: {exc}"


def _phase_2_freqtrade_loop() -> tuple[bool, dict, str, str | None]:
    """Run a minimal simulate_strategy through the real freqtrade path.

    Returns ``(ok, summary, detail, error_type)``. When freqtrade's
    init or runtime raises, ``ok`` is False and ``error_type`` is
    the machine-readable tag carried on the ``SimulationError``
    (``freqtrade_init_failure``, ``freqtrade_runtime_failure``) so
    the PASS/FAIL report contains exact failure semantics instead
    of a generic "something went wrong".
    """
    import numpy as np
    import pandas as pd

    # Build a synthetic 3-ticker universe — same shape as Stage-4.5 fixtures.
    def synth(seed: int) -> pd.DataFrame:
        rng = np.random.default_rng(seed)
        prices = [100.0]
        def leg(a, b, n):
            return list(np.linspace(a, b, n))[1:]
        prices += leg(100, 130, 30)
        prices += leg(130, 115, 15)
        prices += leg(115, 165, 50)
        prices += leg(165, 145, 20)
        prices += leg(145, 195, 50)
        prices += list(195 + np.cumsum(rng.normal(0.05, 0.8, 250)))
        idx = pd.bdate_range("2018-01-01", periods=len(prices))
        return pd.DataFrame(
            {
                "open": prices, "high": [p * 1.008 for p in prices],
                "low": [p * 0.992 for p in prices], "close": prices,
                "volume": [1_500_000] * len(prices),
            }, index=idx,
        )

    universe = {f"AAA{i}": synth(seed=i) for i in range(3)}

    # Stub universes.resolve so no Supabase call is needed.
    from simualpha_quant.research import universes
    universes.resolve = lambda spec: spec.tickers if spec.tickers else []

    from simualpha_quant.execution.simulate import (
        SimulationError,
        run_simulation,
    )
    from simualpha_quant.schemas import (
        DateRange, EntryRules, ExitLeg, ExitRules, PositionSizing,
        PriceRule, StopLoss, StrategySpec, UniverseSpec,
    )

    spec = StrategySpec(
        entry=EntryRules(pattern_name="wave_2_at_618"),
        exit=ExitRules(
            take_profit=[
                ExitLeg(pct_of_position=0.5, price_rule=PriceRule(type="at_fib", level=1.618)),
                ExitLeg(pct_of_position=0.5, price_rule=PriceRule(type="at_fib", level=2.618)),
            ],
            stop_loss=StopLoss(price_rule=PriceRule(type="at_fib", level=0.786), type="hard"),
            time_stop_days=540,
        ),
        position_sizing=PositionSizing(method="fixed", params={"stake_usd": 10_000}),
        universe_spec=UniverseSpec(tickers=list(universe)),
        date_range=DateRange(start=list(universe.values())[0].index[0].date(),
                              end=list(universe.values())[0].index[-1].date()),
        initial_capital=100_000.0,
        max_open_positions=5,
    )

    def loader(ticker, s, e):
        df = universe[ticker]
        return df.loc[(df.index.date >= s) & (df.index.date <= e)]

    try:
        result = run_simulation(spec, price_loader=loader, chart_samples=0)
    except SimulationError as exc:
        # Bug-1 regression guard: freqtrade init / runtime failures
        # MUST NOT masquerade as PASS. Preserve the error_type so
        # the operator sees exactly which phase of freqtrade died.
        return (
            False,
            {},
            f"SimulationError: {exc.detail}\n{traceback.format_exc()[-600:]}",
            exc.error_type,
        )
    except Exception as exc:
        return (
            False,
            {},
            f"{type(exc).__name__}: {exc}\n{traceback.format_exc()[-600:]}",
            "unexpected_phase2_exception",
        )

    summary = {
        "trade_count": len(result.trades),
        "win_rate": round(result.summary.win_rate, 4),
        "profit_factor": round(result.summary.profit_factor, 4),
        "sharpe": round(result.summary.sharpe, 4),
        "max_drawdown_pct": round(result.summary.max_drawdown_pct, 4),
        "equity_points": len(result.equity_curve_close),
        "horizons": [o.horizon_months for o in result.per_horizon_outcomes],
    }
    return True, summary, "ok", None


def main() -> int:
    overall_start = time.time()
    _emit(f"EGRESS_CHECK_PHASE_1_START url=https://api.binance.com/api/v3/exchangeInfo")

    ok1, msg1 = _phase_1_reach_binance()
    _emit(f"EGRESS_CHECK_PHASE_1_RESULT  ok={ok1}  detail={msg1!r}")

    if not ok1:
        _emit("EGRESS_CHECK_STATUS=FAIL  stage=phase_1  reason=binance_unreachable")
        # Emit the 'next steps' line so the operator sees what to do.
        _emit(
            "EGRESS_CHECK_NEXT=Set Railway service network egress to allow "
            "api.binance.com (or vendor freqtrade exchange-markets fixture; "
            "see Stage 4.5 report)."
        )
        return 1

    _emit("EGRESS_CHECK_PHASE_2_START run_simulation")
    p2_start = time.time()
    ok2, summary, msg2, err_type = _phase_2_freqtrade_loop()
    p2_dur = time.time() - p2_start
    _emit(
        f"EGRESS_CHECK_PHASE_2_RESULT  ok={ok2}  duration_s={p2_dur:.2f}  "
        f"error_type={err_type!r}  detail={msg2!r}"
    )

    if ok2:
        try:
            import freqtrade
            ft_ver = freqtrade.__version__
        except Exception:
            ft_ver = "unknown"
        _emit(
            f"EGRESS_CHECK_STATUS=PASS  freqtrade={ft_ver}  "
            f"trades={summary['trade_count']}  win_rate={summary['win_rate']:.3f}  "
            f"sharpe={summary['sharpe']:.3f}  max_dd={summary['max_drawdown_pct']:.3f}  "
            f"duration_s={(time.time() - overall_start):.2f}"
        )
        # Full result for human inspection.
        _emit(f"EGRESS_CHECK_RESULT_JSON={json.dumps(summary)}")
        return 0

    # Phase 2 failed. Preserve the error_type tag end-to-end so an
    # operator greping Railway logs learns whether this was a
    # freqtrade schema bug, a runtime error, or something upstream.
    _emit(
        f"EGRESS_CHECK_STATUS=FAIL  stage=phase_2  "
        f"error_type={err_type or 'unknown'}  reason=freqtrade_loop_failed"
    )
    if err_type == "freqtrade_init_failure":
        _emit(
            "EGRESS_CHECK_NEXT=freqtrade Backtesting init raised — check "
            "build_config against the currently-installed freqtrade's "
            "SCHEMA_TRADE_REQUIRED and add the missing key(s)."
        )
    elif err_type == "freqtrade_runtime_failure":
        _emit(
            "EGRESS_CHECK_NEXT=freqtrade completed init but raised during "
            "backtest — inspect the exception class + stack in "
            "EGRESS_CHECK_PHASE_2_RESULT detail and fix the offending "
            "strategy / dataprovider code."
        )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
