"""Distress analysis service — orchestrates data fetching, scoring, and persistence."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.db.models import DistressReport, ReportHistory
from app.engine.data_provider import get_data_provider
from app.engine.distress_scorer import generate_assessment

logger = logging.getLogger(__name__)


class AnalysisService:
    def analyze_ticker(self, ticker: str, db: Session) -> DistressReport | None:
        """Run distress analysis for a ticker. Returns cached report if fresh, otherwise generates new."""
        upper = ticker.upper().strip()

        # Check for cached report
        existing = (
            db.query(DistressReport)
            .filter(DistressReport.ticker == upper, DistressReport.status == "completed")
            .order_by(DistressReport.generated_at.desc())
            .first()
        )

        if existing:
            from app.core.config import settings
            age = (datetime.now(timezone.utc) - existing.generated_at.replace(tzinfo=timezone.utc)).total_seconds()
            if age < settings.report_cache_ttl:
                logger.info("Returning cached report for %s (age: %.0fs)", upper, age)
                return existing

        # Fetch financial data
        provider = get_data_provider()
        data = provider.fetch(upper)
        if data is None:
            return None

        # Run analysis
        assessment = generate_assessment(data)

        # Persist
        report = DistressReport(
            ticker=assessment.ticker,
            company_name=assessment.company_name,
            sector=assessment.sector,
            industry=assessment.industry,
            distress_rating=assessment.distress_rating,
            distress_score=assessment.distress_score,
            executive_summary=assessment.executive_summary,
            why_safe=assessment.why_safe,
            key_risks=assessment.key_risks,
            stabilizing_factors=assessment.stabilizing_factors,
            what_to_watch=assessment.what_to_watch,
            liquidity_analysis=assessment.liquidity_analysis,
            leverage_analysis=assessment.leverage_analysis,
            profitability_analysis=assessment.profitability_analysis,
            cashflow_analysis=assessment.cashflow_analysis,
            interest_coverage_analysis=assessment.interest_coverage_analysis,
            dilution_risk_analysis=assessment.dilution_risk_analysis,
            long_term_trend_analysis=assessment.long_term_trend_analysis,
            hold_context=assessment.hold_context,
            analyst_notes=assessment.analyst_notes,
            source_period_end=assessment.period_end,
            raw_metrics=assessment.raw_metrics,
            raw_financials=data.raw if data.raw else None,
            report_version="v1",
            status="completed",
        )
        db.add(report)

        # Add history snapshot
        history = ReportHistory(
            report_id=report.id,
            ticker=report.ticker,
            snapshot_date=datetime.now(timezone.utc).date(),
            distress_rating=report.distress_rating,
            distress_score=report.distress_score,
            raw_metrics=assessment.raw_metrics,
            summary=assessment.executive_summary[:500],
        )
        db.add(history)

        db.commit()
        db.refresh(report)
        return report

    def get_report(self, ticker: str, db: Session) -> DistressReport | None:
        """Get the most recent completed report for a ticker."""
        return (
            db.query(DistressReport)
            .filter(DistressReport.ticker == ticker.upper().strip(), DistressReport.status == "completed")
            .order_by(DistressReport.generated_at.desc())
            .first()
        )

    def get_recent_reports(self, db: Session, limit: int = 20) -> list[DistressReport]:
        """Get most recent reports across all tickers."""
        return (
            db.query(DistressReport)
            .filter(DistressReport.status == "completed")
            .order_by(DistressReport.generated_at.desc())
            .limit(limit)
            .all()
        )

    def validate_ticker(self, ticker: str) -> bool:
        """Check if a ticker is recognized by the data provider."""
        provider = get_data_provider()
        return provider.validate_ticker(ticker)


analysis_service = AnalysisService()
