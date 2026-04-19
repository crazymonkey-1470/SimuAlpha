"""argparse CLI for the quant service.

Usage:
    python -m simualpha_quant.cli fetch-prices --tickers HIMS,NKE \\
        --start 2020-01-01 --end 2024-12-31
    python -m simualpha_quant.cli fetch-fundamentals --tickers HIMS,NKE
"""

from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta

from simualpha_quant.logging_config import configure_logging, get_logger


def _split_tickers(raw: str) -> list[str]:
    return [t.strip().upper() for t in raw.split(",") if t.strip()]


def _default_start() -> str:
    return (date.today() - timedelta(days=5 * 365)).isoformat()


def _default_end() -> str:
    return date.today().isoformat()


def _cmd_fetch_prices(args: argparse.Namespace) -> int:
    from simualpha_quant.data.openbb_ingest import fetch_prices

    tickers = _split_tickers(args.tickers)
    if not tickers:
        print("error: --tickers must contain at least one ticker", file=sys.stderr)
        return 2
    rows = fetch_prices(tickers, start=args.start, end=args.end)
    print(f"prices: wrote {rows} rows for {len(tickers)} tickers")
    return 0


def _cmd_fetch_fundamentals(args: argparse.Namespace) -> int:
    from simualpha_quant.data.openbb_ingest import fetch_fundamentals

    tickers = _split_tickers(args.tickers)
    if not tickers:
        print("error: --tickers must contain at least one ticker", file=sys.stderr)
        return 2
    rows = fetch_fundamentals(tickers)
    print(f"fundamentals: wrote {rows} rows for {len(tickers)} tickers")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="simualpha-quant",
        description="SimuAlpha quant research service — data ingestion CLI",
    )
    parser.add_argument("--log-level", default=None, help="Override LOG_LEVEL")
    sub = parser.add_subparsers(dest="command", required=True)

    p_prices = sub.add_parser("fetch-prices", help="Ingest daily OHLCV via OpenBB")
    p_prices.add_argument("--tickers", required=True, help="Comma-separated tickers, e.g. HIMS,NKE")
    p_prices.add_argument("--start", default=_default_start(), help="YYYY-MM-DD (default: 5y ago)")
    p_prices.add_argument("--end", default=_default_end(), help="YYYY-MM-DD (default: today)")
    p_prices.set_defaults(func=_cmd_fetch_prices)

    p_fund = sub.add_parser(
        "fetch-fundamentals", help="Ingest TLI-scoring quarterly fundamentals via OpenBB"
    )
    p_fund.add_argument("--tickers", required=True, help="Comma-separated tickers, e.g. HIMS,NKE")
    p_fund.set_defaults(func=_cmd_fetch_fundamentals)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    configure_logging(args.log_level)
    log = get_logger("simualpha_quant.cli")
    log.info("cli invoked", extra={"command": args.command})
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
