"""Backtest service for the API layer."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any


class BacktestService:
    def get_summary(
        self,
        period: str | None = None,
        start: str | None = None,
        end: str | None = None,
    ) -> dict[str, Any]:
        """Run a backtest and return calibration results as a dict."""
        try:
            from worker.data_providers.yahoo import YahooFinanceProvider
            from worker.engine.calibration import (
                BENCHMARK_PERIODS,
                evaluate_replay_frames,
            )
            from worker.engine.historical_replay import replay_date_range

            provider = YahooFinanceProvider()

            if period:
                periods = [p for p in BENCHMARK_PERIODS if p["name"] == period]
                if not periods:
                    available = [p["name"] for p in BENCHMARK_PERIODS]
                    return {"error": f"Unknown period '{period}'", "available_periods": available}
            elif start and end:
                periods = [{"name": "custom", "start": start, "end": end,
                            "expected_regimes": [], "description": "Custom period"}]
            else:
                return {
                    "available_periods": [
                        {"name": p["name"], "start": p["start"], "end": p["end"],
                         "description": p["description"]}
                        for p in BENCHMARK_PERIODS
                    ],
                    "usage": "Provide ?period=<name> or ?start=YYYY-MM-DD&end=YYYY-MM-DD",
                }

            results = []
            for p in periods:
                frames = replay_date_range(provider, p["start"], p["end"])
                if not frames:
                    continue

                fetch_start = date.fromisoformat(p["start"]) - timedelta(days=30)
                fetch_end = date.fromisoformat(p["end"]) + timedelta(days=30)
                spy_data = provider.fetch_ohlcv("SPY", fetch_start, fetch_end)

                cal = evaluate_replay_frames(
                    frames, spy_data, p["name"], p.get("expected_regimes", [])
                )
                results.append({
                    "period": cal.period_name,
                    "start": cal.start_date,
                    "end": cal.end_date,
                    "frames": cal.total_frames,
                    "regime_counts": cal.regime_counts,
                    "regime_match_rate": cal.regime_match_rate,
                    "regime_transitions": cal.regime_transitions,
                    "max_drawdown": cal.max_drawdown,
                    "base_case_accuracy": cal.base_case_direction_accuracy,
                    "vol_by_regime": cal.vol_by_regime,
                    "signal_returns": cal.signal_returns,
                    "summary": cal.summary,
                })

            return {"results": results}

        except Exception as exc:
            return {"error": str(exc)}


backtest_service = BacktestService()
