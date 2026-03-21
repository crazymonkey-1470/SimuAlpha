"""Symbol-level drilldown, comparison, and intelligence endpoints."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.db.models import (
    ActorStateRecord,
    ReplayFrameRecord,
    ScenarioBranchRecord,
    SignalSummaryRecord,
    SimulationRun,
    RegimeSnapshotRecord,
)
from app.db.session import get_db
from app.schemas.actors import ActorSensitivity, ActorState, ActorStateResponse
from app.schemas.regime import RegimeDriver, RegimeHistoryEntry, RegimeHistoryResponse, RegimeSnapshot
from app.schemas.scenarios import ActorReaction, ScenarioBranch, ScenarioResponse
from app.schemas.signals import SignalHistoryEntry, SignalHistoryResponse, SignalSummary
from app.schemas.symbols import (
    CompareEntry,
    CompareResponse,
    SymbolActorSummary,
    SymbolHistoryResponse,
    SymbolOverview,
    SymbolRegime,
    SymbolReplayFrame,
    SymbolReplayResponse,
    SymbolScenarioSummary,
    SymbolSignal,
    SymbolTimelineEntry,
)

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────


def _get_latest_completed_run(db: Session, symbol: str) -> SimulationRun | None:
    return (
        db.query(SimulationRun)
        .filter(SimulationRun.symbol == symbol, SimulationRun.status == "completed")
        .order_by(desc(SimulationRun.completed_at))
        .first()
    )


def _compute_fragility(risk_flags: list[str], scenarios: list[ScenarioBranchRecord]) -> str:
    """Derive a simple fragility label from risk flags and scenario risk levels."""
    high_risk_count = sum(1 for s in scenarios if s.risk_level in ("high", "elevated"))
    flag_count = len(risk_flags)
    score = flag_count + high_risk_count
    if score >= 4:
        return "high"
    if score >= 2:
        return "elevated"
    if score >= 1:
        return "moderate"
    return "low"


def _build_symbol_overview(db: Session, symbol: str) -> SymbolOverview:
    """Build a complete symbol overview from the latest completed run."""
    run = _get_latest_completed_run(db, symbol)
    if not run:
        return SymbolOverview(symbol=symbol)

    # Regime
    regime_records = db.query(RegimeSnapshotRecord).filter(RegimeSnapshotRecord.run_id == run.id).all()
    regime = None
    risk_flags: list[str] = []
    if regime_records:
        r = regime_records[0]
        risk_flags = r.risk_flags or []
        regime = SymbolRegime(
            regime=r.regime,
            confidence=r.confidence,
            net_pressure=r.net_pressure,
            posture=r.posture,
            risk_flags=risk_flags,
            summary=r.summary,
            updated_at=r.created_at,
        )

    # Signal
    signal_records = db.query(SignalSummaryRecord).filter(SignalSummaryRecord.run_id == run.id).all()
    signal = None
    if signal_records:
        s = signal_records[0]
        signal = SymbolSignal(
            bias=s.bias,
            confidence=s.confidence,
            time_horizon=s.time_horizon,
            suggested_posture=s.suggested_posture,
            warnings=s.warnings or [],
            change_vs_prior=s.change_vs_prior or "",
        )

    # Actors
    actor_records = db.query(ActorStateRecord).filter(ActorStateRecord.run_id == run.id).all()
    actors = [
        SymbolActorSummary(
            name=a.actor_name, archetype=a.archetype, bias=a.bias,
            conviction=a.conviction, contribution=a.contribution, confidence=a.confidence,
        )
        for a in actor_records
    ]
    dominant = max(actor_records, key=lambda a: abs(a.contribution), default=None)

    # Scenarios
    scenario_records = db.query(ScenarioBranchRecord).filter(ScenarioBranchRecord.run_id == run.id).all()
    scenarios = [
        SymbolScenarioSummary(
            name=sc.branch_name, probability=sc.probability,
            direction=sc.direction, risk_level=sc.risk_level,
            is_base_case=(i == 0),
        )
        for i, sc in enumerate(sorted(scenario_records, key=lambda x: x.probability, reverse=True))
    ]

    # Warning count
    warn_count = len(risk_flags) + (len(signal.warnings) if signal else 0)

    return SymbolOverview(
        symbol=symbol,
        regime=regime,
        signal=signal,
        actors=actors,
        scenarios=scenarios,
        dominant_actor=dominant.actor_name if dominant else None,
        fragility=_compute_fragility(risk_flags, scenario_records),
        warning_count=warn_count,
        last_simulation_at=run.completed_at,
        run_id=str(run.id),
    )


# ── Compare symbols (must be before {symbol} routes) ─────────────────────


@router.get("/compare", response_model=CompareResponse)
async def compare_symbols(
    symbols: str = Query(description="Comma-separated symbols, e.g. SPY,QQQ,TLT"),
    db: Session = Depends(get_db),
) -> CompareResponse:
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()][:10]
    entries = []
    for sym in symbol_list:
        overview = _build_symbol_overview(db, sym)
        entries.append(CompareEntry(
            symbol=sym,
            regime=overview.regime.regime if overview.regime else None,
            regime_confidence=overview.regime.confidence if overview.regime else None,
            net_pressure=overview.regime.net_pressure if overview.regime else None,
            signal_bias=overview.signal.bias if overview.signal else None,
            signal_confidence=overview.signal.confidence if overview.signal else None,
            dominant_actor=overview.dominant_actor,
            fragility=overview.fragility,
            base_scenario=overview.scenarios[0].name if overview.scenarios else None,
            base_scenario_direction=overview.scenarios[0].direction if overview.scenarios else None,
            posture=overview.regime.posture if overview.regime else None,
            warning_count=overview.warning_count,
            last_simulation_at=overview.last_simulation_at,
        ))
    return CompareResponse(symbols=entries, compared_at=datetime.now(timezone.utc))


# ── Symbol overview ──────────────────────────────────────────────────────


@router.get("/{symbol}/overview", response_model=SymbolOverview)
async def get_symbol_overview(symbol: str, db: Session = Depends(get_db)) -> SymbolOverview:
    return _build_symbol_overview(db, symbol.upper())


# ── Symbol regime ────────────────────────────────────────────────────────


@router.get("/{symbol}/regime", response_model=RegimeSnapshot)
async def get_symbol_regime(symbol: str, db: Session = Depends(get_db)) -> RegimeSnapshot:
    r = (
        db.query(RegimeSnapshotRecord)
        .filter(RegimeSnapshotRecord.symbol == symbol.upper())
        .order_by(desc(RegimeSnapshotRecord.created_at))
        .first()
    )
    if not r:
        return RegimeSnapshot(
            regime="unknown", confidence=0, net_pressure=0, posture="neutral",
            risk_flags=[], drivers=[], summary="No data available",
            updated_at=datetime.now(timezone.utc),
        )
    return RegimeSnapshot(
        regime=r.regime, confidence=r.confidence, net_pressure=r.net_pressure,
        posture=r.posture, risk_flags=r.risk_flags or [],
        drivers=[RegimeDriver(**d) for d in (r.drivers or [])],
        summary=r.summary, updated_at=r.created_at,
    )


# ── Symbol actors ────────────────────────────────────────────────────────


@router.get("/{symbol}/actors", response_model=ActorStateResponse)
async def get_symbol_actors(symbol: str, db: Session = Depends(get_db)) -> ActorStateResponse:
    run = _get_latest_completed_run(db, symbol.upper())
    if not run:
        return ActorStateResponse(actors=[], actor_count=0)
    records = db.query(ActorStateRecord).filter(ActorStateRecord.run_id == run.id).all()
    actors = [
        ActorState(
            id=str(r.id), name=r.actor_name, archetype=r.archetype,
            bias=r.bias, conviction=r.conviction, contribution=r.contribution,
            horizon=r.horizon, sensitivities=[ActorSensitivity(**s) for s in (r.sensitivities or [])],
            recent_change=r.recent_change or "", confidence=r.confidence,
        )
        for r in records
    ]
    return ActorStateResponse(actors=actors, actor_count=len(actors))


# ── Symbol scenarios ─────────────────────────────────────────────────────


@router.get("/{symbol}/scenarios", response_model=ScenarioResponse)
async def get_symbol_scenarios(symbol: str, db: Session = Depends(get_db)) -> ScenarioResponse:
    run = _get_latest_completed_run(db, symbol.upper())
    if not run:
        return ScenarioResponse(scenarios=[], base_case_id="")
    records = db.query(ScenarioBranchRecord).filter(ScenarioBranchRecord.run_id == run.id).all()
    scenarios = [
        ScenarioBranch(
            id=str(r.id), name=r.branch_name, probability=r.probability,
            direction=r.direction, drivers=r.drivers or [],
            invalidation_conditions=r.invalidation_conditions or [],
            actor_reactions=[ActorReaction(**ar) for ar in (r.actor_reactions or [])],
            risk_level=r.risk_level, notes=r.notes or "",
        )
        for r in records
    ]
    base_id = str(records[0].id) if records else ""
    return ScenarioResponse(scenarios=scenarios, base_case_id=base_id)


# ── Symbol signals ───────────────────────────────────────────────────────


@router.get("/{symbol}/signals", response_model=SignalSummary)
async def get_symbol_signals(symbol: str, db: Session = Depends(get_db)) -> SignalSummary:
    r = (
        db.query(SignalSummaryRecord)
        .filter(SignalSummaryRecord.symbol == symbol.upper())
        .order_by(desc(SignalSummaryRecord.created_at))
        .first()
    )
    if not r:
        return SignalSummary(
            bias="neutral", confidence=0, time_horizon="unknown",
            suggested_posture="neutral", warnings=[], change_vs_prior="No data",
            updated_at=datetime.now(timezone.utc),
        )
    return SignalSummary(
        bias=r.bias, confidence=r.confidence, time_horizon=r.time_horizon,
        suggested_posture=r.suggested_posture, warnings=r.warnings or [],
        change_vs_prior=r.change_vs_prior or "", updated_at=r.created_at,
    )


# ── Symbol history timeline ──────────────────────────────────────────────


@router.get("/{symbol}/history", response_model=SymbolHistoryResponse)
async def get_symbol_history(
    symbol: str,
    limit: int = Query(default=30, ge=1, le=200),
    db: Session = Depends(get_db),
) -> SymbolHistoryResponse:
    sym = symbol.upper()
    # Gather regime snapshots timeline
    regimes = (
        db.query(RegimeSnapshotRecord)
        .filter(RegimeSnapshotRecord.symbol == sym)
        .order_by(desc(RegimeSnapshotRecord.created_at))
        .limit(limit)
        .all()
    )
    # Build a date->signal lookup
    signals = (
        db.query(SignalSummaryRecord)
        .filter(SignalSummaryRecord.symbol == sym)
        .order_by(desc(SignalSummaryRecord.created_at))
        .limit(limit)
        .all()
    )
    signal_map = {}
    for s in signals:
        date_key = s.created_at.strftime("%Y-%m-%d") if s.created_at else ""
        if date_key and date_key not in signal_map:
            signal_map[date_key] = s

    entries = []
    for r in regimes:
        date_key = r.created_at.strftime("%Y-%m-%d") if r.created_at else ""
        sig = signal_map.get(date_key)
        entries.append(SymbolTimelineEntry(
            date=date_key,
            regime=r.regime,
            regime_confidence=r.confidence,
            net_pressure=r.net_pressure,
            signal_bias=sig.bias if sig else None,
            signal_confidence=sig.confidence if sig else None,
        ))

    return SymbolHistoryResponse(symbol=sym, entries=entries, total=len(entries))


# ── Symbol replay frames ────────────────────────────────────────────────


@router.get("/{symbol}/replay", response_model=SymbolReplayResponse)
async def get_symbol_replay(
    symbol: str,
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
) -> SymbolReplayResponse:
    sym = symbol.upper()
    q = db.query(ReplayFrameRecord).filter(ReplayFrameRecord.symbol == sym)
    if start_date:
        q = q.filter(ReplayFrameRecord.frame_date >= start_date)
    if end_date:
        q = q.filter(ReplayFrameRecord.frame_date <= end_date)
    frames = q.order_by(desc(ReplayFrameRecord.frame_date)).limit(limit).all()
    return SymbolReplayResponse(
        symbol=sym,
        frames=[
            SymbolReplayFrame(
                date=f.frame_date, regime=f.regime, regime_confidence=f.regime_confidence,
                net_pressure=f.net_pressure, signal_bias=f.signal_bias,
                notes=f.notes, realized_outcome=f.realized_outcome,
            )
            for f in frames
        ],
        total=len(frames),
    )


# ── Symbol runs ──────────────────────────────────────────────────────────


@router.get("/{symbol}/runs")
async def get_symbol_runs(
    symbol: str,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    runs = (
        db.query(SimulationRun)
        .filter(SimulationRun.symbol == symbol.upper())
        .order_by(desc(SimulationRun.created_at))
        .limit(limit)
        .all()
    )
    return {
        "symbol": symbol.upper(),
        "runs": [
            {
                "id": str(r.id),
                "run_type": r.run_type,
                "status": r.status,
                "source": r.source,
                "summary": r.summary,
                "warnings": r.warnings or [],
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            }
            for r in runs
        ],
        "total": len(runs),
    }
