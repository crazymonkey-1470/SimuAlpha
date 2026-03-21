"""Tests for repository CRUD operations."""

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.db.models import SimulationRun
from app.repositories.actor import actor_repo
from app.repositories.calibration import calibration_repo
from app.repositories.regime import regime_repo
from app.repositories.replay import replay_repo
from app.repositories.signal import signal_repo
from app.repositories.simulation_run import simulation_run_repo


@pytest.fixture
def db() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


def test_simulation_run_create_and_get(db: Session) -> None:
    run = simulation_run_repo.create(db, run_type="current", symbol="SPY", source="test")
    assert run.id is not None
    assert run.status == "pending"

    simulation_run_repo.mark_running(db, run.id)
    db.refresh(run)
    assert run.status == "running"

    simulation_run_repo.mark_completed(db, run.id, "Done", ["warn"])
    db.refresh(run)
    assert run.status == "completed"
    assert run.summary == "Done"


def test_simulation_run_list_recent(db: Session) -> None:
    for i in range(5):
        run = simulation_run_repo.create(db, run_type="current", symbol="SPY", source="test")
        simulation_run_repo.mark_completed(db, run.id, f"Run {i}")
    db.commit()

    runs = simulation_run_repo.list_recent(db, limit=3)
    assert len(runs) == 3


def test_regime_repo_create_and_get(db: Session) -> None:
    run = simulation_run_repo.create(db, symbol="SPY")
    regime_repo.create(db, run_id=run.id, data={
        "regime": "fragile uptrend",
        "confidence": 0.72,
        "net_pressure": 0.18,
        "posture": "cautiously long",
        "summary": "Test regime",
        "drivers": [{"factor": "test", "influence": 0.5, "description": "desc"}],
        "risk_flags": ["flag"],
    })
    db.commit()

    latest = regime_repo.get_latest(db, "SPY")
    assert latest is not None
    assert latest.regime == "fragile uptrend"

    history = regime_repo.get_history(db, "SPY", limit=10)
    assert len(history) == 1


def test_actor_repo_create_many(db: Session) -> None:
    run = simulation_run_repo.create(db, symbol="SPY")
    actors = actor_repo.create_many(db, run_id=run.id, actors=[
        {"name": "Trend Followers", "archetype": "trend_follower", "bias": "bullish",
         "conviction": 0.6, "contribution": 0.2, "confidence": 0.7, "horizon": "2w"},
        {"name": "Mean Reverters", "archetype": "mean_reverter", "bias": "neutral",
         "conviction": 0.4, "contribution": -0.05, "confidence": 0.75, "horizon": "1d"},
    ])
    db.commit()
    assert len(actors) == 2

    by_run = actor_repo.get_by_run_id(db, run.id)
    assert len(by_run) == 2


def test_signal_repo(db: Session) -> None:
    run = simulation_run_repo.create(db, symbol="SPY")
    signal_repo.create(db, run_id=run.id, data={
        "bias": "mildly bullish", "confidence": 0.62, "time_horizon": "1w",
        "suggested_posture": "long", "warnings": ["w1"],
    })
    db.commit()

    latest = signal_repo.get_latest(db, "SPY")
    assert latest is not None
    assert latest.bias == "mildly bullish"


def test_replay_repo(db: Session) -> None:
    run = replay_repo.create_run(db, start_date="2025-01-01", end_date="2025-01-05")
    replay_repo.create_frame(db, replay_run_id=run.id, data={
        "date": "2025-01-01", "regime": "uptrend", "regime_confidence": 0.8,
        "net_pressure": 0.3, "notes": "test",
    })
    db.commit()

    frames = replay_repo.get_frames_by_run(db, run.id)
    assert len(frames) == 1

    by_date = replay_repo.get_frame_by_date(db, "SPY", "2025-01-01")
    assert by_date is not None


def test_calibration_repo(db: Session) -> None:
    run = calibration_repo.create(db, start_date="2020-01-01", end_date="2020-12-31", period_name="test")
    calibration_repo.mark_completed(db, run.id, "Done", {"accuracy": 0.9})
    db.commit()

    latest = calibration_repo.get_latest(db, "SPY")
    assert latest is not None
    assert latest.metrics["accuracy"] == 0.9
