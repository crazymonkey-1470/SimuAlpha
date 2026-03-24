"""Distress report API routes — analyze, retrieve, and list reports."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.db.session import get_db
from app.schemas.report import (
    AnalyzeRequest,
    AnalyzeResponse,
    DistressReportResponse,
    RecentReportsResponse,
    ReportSummary,
)
from app.services.analysis import analysis_service

router = APIRouter()


def _report_to_response(r) -> DistressReportResponse:  # type: ignore[no-untyped-def]
    return DistressReportResponse(
        id=str(r.id),
        ticker=r.ticker,
        company_name=r.company_name,
        sector=r.sector,
        industry=r.industry,
        distress_rating=r.distress_rating,
        distress_score=r.distress_score,
        executive_summary=r.executive_summary,
        why_safe=r.why_safe or [],
        key_risks=r.key_risks or [],
        stabilizing_factors=r.stabilizing_factors or [],
        what_to_watch=r.what_to_watch or [],
        liquidity_analysis=r.liquidity_analysis,
        leverage_analysis=r.leverage_analysis,
        profitability_analysis=r.profitability_analysis,
        cashflow_analysis=r.cashflow_analysis,
        interest_coverage_analysis=r.interest_coverage_analysis,
        dilution_risk_analysis=r.dilution_risk_analysis,
        long_term_trend_analysis=r.long_term_trend_analysis,
        hold_context=r.hold_context,
        analyst_notes=r.analyst_notes,
        source_period_end=r.source_period_end,
        raw_metrics=r.raw_metrics,
        report_version=r.report_version,
        status=r.status,
        generated_at=r.generated_at,
        updated_at=r.updated_at,
    )


def _report_to_summary(r) -> ReportSummary:  # type: ignore[no-untyped-def]
    return ReportSummary(
        id=str(r.id),
        ticker=r.ticker,
        company_name=r.company_name,
        sector=r.sector,
        distress_rating=r.distress_rating,
        distress_score=r.distress_score,
        executive_summary=r.executive_summary[:300] + ("..." if len(r.executive_summary) > 300 else ""),
        generated_at=r.generated_at,
    )


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_ticker(body: AnalyzeRequest, db: Session = Depends(get_db)) -> AnalyzeResponse:
    """Analyze a ticker for distress risk. Returns cached report if fresh."""
    ticker = body.ticker.upper().strip()
    report = analysis_service.analyze_ticker(ticker, db)
    if report is None:
        return AnalyzeResponse(
            ticker=ticker,
            status="not_found",
            message=f"Ticker '{ticker}' was not found or financial data is unavailable.",
        )
    return AnalyzeResponse(
        ticker=ticker,
        status="completed",
        report=_report_to_response(report),
    )


@router.get("/report/{ticker}", response_model=DistressReportResponse)
async def get_report(ticker: str, db: Session = Depends(get_db)) -> DistressReportResponse:
    """Get the most recent distress report for a ticker."""
    report = analysis_service.get_report(ticker, db)
    if report is None:
        raise NotFoundError(f"No report found for ticker '{ticker.upper()}'")
    return _report_to_response(report)


@router.get("/recent", response_model=RecentReportsResponse)
async def get_recent_reports(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> RecentReportsResponse:
    """Get the most recent distress reports."""
    reports = analysis_service.get_recent_reports(db, limit=limit)
    return RecentReportsResponse(
        reports=[_report_to_summary(r) for r in reports],
        total=len(reports),
    )


@router.get("/validate/{ticker}")
async def validate_ticker(ticker: str) -> dict:
    """Check if a ticker is recognized."""
    valid = analysis_service.validate_ticker(ticker)
    return {"ticker": ticker.upper().strip(), "valid": valid}
