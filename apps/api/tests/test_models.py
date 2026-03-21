"""Tests for database model creation and basic CRUD."""

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.db.models import (
    ActorStateRecord,
    CalibrationRun,
    RegimeSnapshotRecord,
    ReplayFrameRecord,
    ReplayRun,
    ScenarioBranchRecord,
    SignalSummaryRecord,
    SimulationRun,
    SystemStatusRecord,
)


@pytest.fixture
def db() -> Session:
    """Create an in-memory SQLite session for testing."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


def test_create_simulation_run(db: Session) -> None:
    run = SimulationRun(
        id=uuid.uuid4(),
        run_type="current",
        symbol="SPY",
        status="pending",
        source="worker",
    )
    db.add(run)
    db.flush()
    assert run.id is not None
    assert run.status == "pending"


def test_simulation_run_status_transitions(db: Session) -> None:
    run = SimulationRun(
        id=uuid.uuid4(), run_type="current", symbol="SPY", status="pending", source="api"
    )
    db.add(run)
    db.flush()

    run.status = "running"
    run.started_at = datetime.now(timezone.utc)
    db.flush()
    assert run.status == "running"

    run.status = "completed"
    run.completed_at = datetime.now(timezone.utc)
    run.summary = "Test completed"
    db.flush()
    assert run.status == "completed"
    assert run.summary == "Test completed"


def test_regime_snapshot_linked_to_run(db: Session) -> None:
    run = SimulationRun(
        id=uuid.uuid4(), run_type="current", symbol="SPY", status="completed", source="worker"
    )
    db.add(run)
    db.flush()

    regime = RegimeSnapshotRecord(
        id=uuid.uuid4(),
        run_id=run.id,
        symbol="SPY",
        regime="fragile uptrend",
        confidence=0.72,
        net_pressure=0.18,
        posture="cautiously long",
        summary="Test summary",
        drivers=[{"factor": "test", "influence": 0.5, "description": "test driver"}],
        risk_flags=["flag1"],
    )
    db.add(regime)
    db.flush()

    assert regime.run_id == run.id
    assert regime.drivers[0]["factor"] == "test"


def test_actor_states_for_run(db: Session) -> None:
    run = SimulationRun(
        id=uuid.uuid4(), run_type="current", symbol="SPY", status="completed", source="worker"
    )
    db.add(run)
    db.flush()

    actors = [
        ActorStateRecord(
            id=uuid.uuid4(),
            run_id=run.id,
            symbol="SPY",
            actor_name="Trend Followers",
            archetype="trend_follower",
            bias="bullish",
            conviction=0.6,
            contribution=0.2,
            confidence=0.7,
            horizon="2-6 weeks",
        ),
        ActorStateRecord(
            id=uuid.uuid4(),
            run_id=run.id,
            symbol="SPY",
            actor_name="Mean Reverters",
            archetype="mean_reverter",
            bias="neutral",
            conviction=0.4,
            contribution=-0.05,
            confidence=0.75,
            horizon="1-5 days",
        ),
    ]
    db.add_all(actors)
    db.flush()

    result = db.query(ActorStateRecord).filter(ActorStateRecord.run_id == run.id).all()
    assert len(result) == 2


def test_scenario_branches(db: Session) -> None:
    run = SimulationRun(
        id=uuid.uuid4(), run_type="current", symbol="SPY", status="completed", source="worker"
    )
    db.add(run)
    db.flush()

    scenario = ScenarioBranchRecord(
        id=uuid.uuid4(),
        run_id=run.id,
        symbol="SPY",
        branch_name="Base case",
        probability=0.5,
        direction="mildly bullish",
        risk_level="moderate",
        drivers=["driver1"],
        actor_reactions=[{"actor_archetype": "trend_follower", "expected_behavior": "hold"}],
    )
    db.add(scenario)
    db.flush()
    assert scenario.probability == 0.5


def test_signal_summary(db: Session) -> None:
    run = SimulationRun(
        id=uuid.uuid4(), run_type="current", symbol="SPY", status="completed", source="worker"
    )
    db.add(run)
    db.flush()

    signal = SignalSummaryRecord(
        id=uuid.uuid4(),
        run_id=run.id,
        symbol="SPY",
        bias="mildly bullish",
        confidence=0.62,
        time_horizon="1-2 weeks",
        suggested_posture="cautiously long",
        warnings=["warn1"],
    )
    db.add(signal)
    db.flush()
    assert signal.bias == "mildly bullish"


def test_replay_run_and_frames(db: Session) -> None:
    run = ReplayRun(
        id=uuid.uuid4(),
        symbol="SPY",
        start_date="2025-03-18",
        end_date="2025-03-21",
        status="completed",
        frame_count=4,
    )
    db.add(run)
    db.flush()

    frame = ReplayFrameRecord(
        id=uuid.uuid4(),
        replay_run_id=run.id,
        symbol="SPY",
        frame_date="2025-03-18",
        regime="range compression",
        regime_confidence=0.78,
        net_pressure=-0.02,
        realized_outcome="SPX flat",
        snapshot_payload={"actor_states": [], "scenario_branches": []},
    )
    db.add(frame)
    db.flush()

    result = db.query(ReplayFrameRecord).filter(ReplayFrameRecord.replay_run_id == run.id).all()
    assert len(result) == 1
    assert result[0].frame_date == "2025-03-18"


def test_calibration_run(db: Session) -> None:
    run = CalibrationRun(
        id=uuid.uuid4(),
        symbol="SPY",
        period_name="covid_crash",
        start_date="2020-02-01",
        end_date="2020-04-30",
        status="completed",
        metrics={"regime_match_rate": 0.72, "max_drawdown": -0.34},
        summary="Good calibration",
    )
    db.add(run)
    db.flush()
    assert run.metrics["regime_match_rate"] == 0.72


def test_system_status_singleton(db: Session) -> None:
    status = SystemStatusRecord(
        id=1,
        worker_status="idle",
        last_successful_simulation=datetime.now(timezone.utc),
        warnings=["test warning"],
    )
    db.add(status)
    db.flush()

    result = db.get(SystemStatusRecord, 1)
    assert result is not None
    assert result.worker_status == "idle"
