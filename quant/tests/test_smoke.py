"""Smoke test: the four core libraries must import cleanly."""

from __future__ import annotations

import importlib

import pytest


@pytest.mark.parametrize(
    "module",
    [
        "openbb",
        "qlib",
        "mplfinance",
        "freqtrade",
    ],
)
def test_core_libraries_import(module: str) -> None:
    assert importlib.import_module(module) is not None


def test_service_package_imports() -> None:
    pkg = importlib.import_module("simualpha_quant")
    assert pkg.__version__
    importlib.import_module("simualpha_quant.cli")
    importlib.import_module("simualpha_quant.data.openbb_ingest")
    importlib.import_module("simualpha_quant.logging_config")
