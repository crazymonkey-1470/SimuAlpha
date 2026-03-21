"""SimuAlpha Worker — CLI entrypoint.

Usage:
    python -m worker.main simulate [--seed SEED] [--real]
    python -m worker.main replay --date 2024-03-15 [--real]
    python -m worker.main replay --start 2024-01-02 --end 2024-03-29 [--real]
    python -m worker.main backtest [--period PERIOD]
    python -m worker.main calibrate [--period PERIOD]
    python -m worker.main fetch-data [--start DATE] [--end DATE]
    python -m worker.main schedule
    python -m worker.main status
"""

from __future__ import annotations

import argparse
import sys

from worker.core.config import get_settings
from worker.core.logging import setup_logging


def main(argv: list[str] | None = None) -> None:
    settings = get_settings()
    log = setup_logging()

    parser = argparse.ArgumentParser(
        prog="simualpha-worker",
        description="SimuAlpha simulation worker service",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # ── simulate ─────────────────────────────────────────────────────────
    p_sim = sub.add_parser("simulate", help="Run a full simulation")
    p_sim.add_argument("--seed", type=int, default=None, help="Fixed seed (synthetic mode)")
    p_sim.add_argument("--real", action="store_true", help="Use real market data")

    # ── replay ───────────────────────────────────────────────────────────
    p_replay = sub.add_parser("replay", help="Generate replay frame(s)")
    p_replay.add_argument("--date", type=str, default=None, help="Single date (YYYY-MM-DD)")
    p_replay.add_argument("--start", type=str, default=None, help="Range start date")
    p_replay.add_argument("--end", type=str, default=None, help="Range end date")
    p_replay.add_argument("--seed", type=int, default=None, help="Fixed seed (synthetic mode)")
    p_replay.add_argument("--real", action="store_true", help="Use real market data")

    # ── backtest (alias for real replay + calibration) ───────────────────
    p_bt = sub.add_parser("backtest", help="Run backtest over a benchmark period")
    p_bt.add_argument("--period", type=str, default=None, help="Benchmark period name (e.g. covid_crash)")
    p_bt.add_argument("--start", type=str, default=None, help="Custom start date")
    p_bt.add_argument("--end", type=str, default=None, help="Custom end date")

    # ── calibrate ────────────────────────────────────────────────────────
    p_cal = sub.add_parser("calibrate", help="Run calibration across benchmark periods")
    p_cal.add_argument("--period", type=str, default=None, help="Single period, or all if omitted")

    # ── fetch-data ───────────────────────────────────────────────────────
    p_fetch = sub.add_parser("fetch-data", help="Fetch/cache market data")
    p_fetch.add_argument("--start", type=str, default=None, help="Start date (default: 2020-01-01)")
    p_fetch.add_argument("--end", type=str, default=None, help="End date (default: today)")

    # ── schedule ─────────────────────────────────────────────────────────
    sub.add_parser("schedule", help="Show scheduled job definitions")

    # ── status ───────────────────────────────────────────────────────────
    sub.add_parser("status", help="Show recent job runs")

    args = parser.parse_args(argv)

    log.info(
        "SimuAlpha Worker starting (env=%s, model=%s)",
        settings.environment,
        settings.model_version,
    )

    if args.command == "simulate":
        _cmd_simulate(args)
    elif args.command == "replay":
        _cmd_replay(args)
    elif args.command == "backtest":
        _cmd_backtest(args)
    elif args.command == "calibrate":
        _cmd_calibrate(args)
    elif args.command == "fetch-data":
        _cmd_fetch_data(args)
    elif args.command == "schedule":
        _cmd_schedule()
    elif args.command == "status":
        _cmd_status()


def _cmd_simulate(args: argparse.Namespace) -> None:
    from worker.jobs.simulation_job import execute

    run_id = execute(seed=args.seed, use_real_data=args.real)
    mode = "real data" if args.real else "synthetic"
    print(f"\nSimulation complete ({mode}). Run ID: {run_id}")


def _cmd_replay(args: argparse.Namespace) -> None:
    if args.real:
        _cmd_replay_real(args)
    else:
        _cmd_replay_synthetic(args)


def _cmd_replay_synthetic(args: argparse.Namespace) -> None:
    from worker.jobs.replay_job import execute_range, execute_single

    if args.date:
        run_id = execute_single(args.date, seed=args.seed)
        print(f"\nReplay frame generated (synthetic). Run ID: {run_id}")
    elif args.start and args.end:
        run_id = execute_range(args.start, args.end, seed=args.seed)
        print(f"\nReplay range generated (synthetic). Run ID: {run_id}")
    else:
        print("Error: provide --date or both --start and --end", file=sys.stderr)
        sys.exit(1)


def _cmd_replay_real(args: argparse.Namespace) -> None:
    from worker.core.logging import get_logger
    from worker.data_providers.yahoo import YahooFinanceProvider
    from worker.engine.historical_replay import replay_date_range, replay_single_date

    log = get_logger("cmd.replay")
    provider = YahooFinanceProvider()

    if args.date:
        frame = replay_single_date(provider, args.date)
        if frame is None:
            print(f"No data available for {args.date}")
            sys.exit(1)
        log.info("Replay %s: regime=%s conf=%.2f actors=%d outcome=%s",
                 frame.date, frame.regime, frame.regime_confidence,
                 len(frame.actor_states), "yes" if frame.realized_outcome else "no")
        if frame.realized_outcome:
            log.info("  Outcome: %s", frame.realized_outcome)
        print(f"\nReplay frame generated (real data) for {args.date}")
    elif args.start and args.end:
        frames = replay_date_range(provider, args.start, args.end)
        for f in frames:
            log.info("  Replay %s: regime=%-18s conf=%.2f pressure=%+.2f",
                     f.date, f.regime, f.regime_confidence, f.net_pressure)
        print(f"\nReplay range generated (real data): {len(frames)} frames")
    else:
        print("Error: provide --date or both --start and --end", file=sys.stderr)
        sys.exit(1)


def _cmd_backtest(args: argparse.Namespace) -> None:
    from worker.core.logging import get_logger
    from worker.data_providers.yahoo import YahooFinanceProvider
    from worker.engine.calibration import (
        BENCHMARK_PERIODS,
        evaluate_replay_frames,
        format_calibration_report,
    )
    from worker.engine.historical_replay import replay_date_range

    log = get_logger("cmd.backtest")
    provider = YahooFinanceProvider()

    if args.period:
        periods = [p for p in BENCHMARK_PERIODS if p["name"] == args.period]
        if not periods:
            print(f"Unknown period: {args.period}. Available: {[p['name'] for p in BENCHMARK_PERIODS]}")
            sys.exit(1)
    elif args.start and args.end:
        periods = [{"name": "custom", "start": args.start, "end": args.end,
                     "expected_regimes": [], "description": "Custom period"}]
    else:
        periods = BENCHMARK_PERIODS[:2]  # Default to first 2 for speed
        log.info("No period specified; running first 2 benchmarks. Use --period to select.")

    results = []
    for period in periods:
        log.info("Running backtest: %s (%s to %s)", period["name"], period["start"], period["end"])
        frames = replay_date_range(provider, period["start"], period["end"])
        if not frames:
            log.warning("No frames generated for %s", period["name"])
            continue

        from datetime import date, timedelta
        import pandas as pd
        start = date.fromisoformat(period["start"]) - timedelta(days=30)
        end = date.fromisoformat(period["end"]) + timedelta(days=30)
        spy_data = provider.fetch_ohlcv("SPY", start, end)

        result = evaluate_replay_frames(
            frames, spy_data, period["name"], period.get("expected_regimes", [])
        )
        results.append(result)
        log.info("  %s", result.summary)

    report = format_calibration_report(results)
    print(report)


def _cmd_calibrate(args: argparse.Namespace) -> None:
    # Calibrate runs the same as backtest but over all benchmark periods
    args.start = None
    args.end = None
    if not args.period:
        from worker.engine.calibration import BENCHMARK_PERIODS
        args.period = None  # Will default to first 2 in backtest
        # Override to run all
        args_override = argparse.Namespace(period=None, start=None, end=None)
        # Run _cmd_backtest with all periods
        from worker.core.logging import get_logger
        from worker.data_providers.yahoo import YahooFinanceProvider
        from worker.engine.calibration import (
            BENCHMARK_PERIODS,
            evaluate_replay_frames,
            format_calibration_report,
        )
        from worker.engine.historical_replay import replay_date_range

        log = get_logger("cmd.calibrate")
        provider = YahooFinanceProvider()

        periods = [p for p in BENCHMARK_PERIODS if p["name"] == args.period] if args.period else BENCHMARK_PERIODS

        results = []
        for period in periods:
            log.info("Calibrating: %s (%s to %s)", period["name"], period["start"], period["end"])
            frames = replay_date_range(provider, period["start"], period["end"])
            if not frames:
                continue

            from datetime import date, timedelta
            start = date.fromisoformat(period["start"]) - timedelta(days=30)
            end = date.fromisoformat(period["end"]) + timedelta(days=30)
            spy_data = provider.fetch_ohlcv("SPY", start, end)

            result = evaluate_replay_frames(
                frames, spy_data, period["name"], period.get("expected_regimes", [])
            )
            results.append(result)
            log.info("  %s", result.summary)

        report = format_calibration_report(results)
        print(report)
    else:
        _cmd_backtest(args)


def _cmd_fetch_data(args: argparse.Namespace) -> None:
    from datetime import date

    from worker.core.logging import get_logger
    from worker.data_providers.yahoo import YahooFinanceProvider

    log = get_logger("cmd.fetch")
    provider = YahooFinanceProvider()

    start = date.fromisoformat(args.start) if args.start else date(2020, 1, 1)
    end = date.fromisoformat(args.end) if args.end else date.today()
    symbols = ["SPY", "QQQ", "TLT", "VIX", "NVDA"]

    log.info("Fetching data for %s from %s to %s", symbols, start, end)
    data = provider.fetch_multi(symbols, start, end)
    for sym, df in data.items():
        log.info("  %s: %d rows (%s to %s)", sym, len(df),
                 df.index[0].date() if len(df) > 0 else "N/A",
                 df.index[-1].date() if len(df) > 0 else "N/A")
    print(f"\nFetched and cached data for {len(data)} symbols.")


def _cmd_schedule() -> None:
    from worker.jobs.scheduled_jobs import print_schedule

    print_schedule()


def _cmd_status() -> None:
    from worker.services.job_registry import get_recent_runs

    runs = get_recent_runs()
    if not runs:
        print("No job runs recorded in this session.")
        return

    print(f"\n{'Run ID':<20} {'Type':<14} {'Status':<12} {'Summary'}")
    print("─" * 80)
    for run in runs:
        print(
            f"{run.run_id:<20} {run.job_type.value:<14} {run.status.value:<12} "
            f"{run.summary or '—'}"
        )


if __name__ == "__main__":
    main()
