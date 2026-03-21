"""SimuAlpha Worker — CLI entrypoint.

Usage:
    python -m worker.main simulate [--seed SEED]
    python -m worker.main replay --date 2025-03-18 [--seed SEED]
    python -m worker.main replay --start 2025-03-17 --end 2025-03-21 [--seed SEED]
    python -m worker.main calibrate
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
    p_sim.add_argument("--seed", type=int, default=None, help="Fixed seed for reproducibility")

    # ── replay ───────────────────────────────────────────────────────────
    p_replay = sub.add_parser("replay", help="Generate replay frame(s)")
    p_replay.add_argument("--date", type=str, default=None, help="Single date (YYYY-MM-DD)")
    p_replay.add_argument("--start", type=str, default=None, help="Range start date")
    p_replay.add_argument("--end", type=str, default=None, help="Range end date")
    p_replay.add_argument("--seed", type=int, default=None, help="Fixed seed for reproducibility")

    # ── calibrate ────────────────────────────────────────────────────────
    sub.add_parser("calibrate", help="Run calibration (scaffold)")

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
    elif args.command == "calibrate":
        _cmd_calibrate()
    elif args.command == "schedule":
        _cmd_schedule()
    elif args.command == "status":
        _cmd_status()


def _cmd_simulate(args: argparse.Namespace) -> None:
    from worker.jobs.simulation_job import execute

    run_id = execute(seed=args.seed)
    print(f"\nSimulation complete. Run ID: {run_id}")


def _cmd_replay(args: argparse.Namespace) -> None:
    from worker.jobs.replay_job import execute_range, execute_single

    if args.date:
        run_id = execute_single(args.date, seed=args.seed)
        print(f"\nReplay frame generated. Run ID: {run_id}")
    elif args.start and args.end:
        run_id = execute_range(args.start, args.end, seed=args.seed)
        print(f"\nReplay range generated. Run ID: {run_id}")
    else:
        print("Error: provide --date or both --start and --end", file=sys.stderr)
        sys.exit(1)


def _cmd_calibrate() -> None:
    from worker.jobs.calibration_job import execute

    run_id = execute()
    print(f"\nCalibration scaffold complete. Run ID: {run_id}")


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
