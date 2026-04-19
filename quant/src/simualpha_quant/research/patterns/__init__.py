"""Named pattern library.

Each pattern is a ``PatternDef`` accessible by name via ``PATTERNS``.
The backtest engine looks up by name; the OpenClaw-facing tool also
returns this list as its list of recognized pattern names.
"""

from __future__ import annotations

from simualpha_quant.research.patterns._base import PatternDef
from simualpha_quant.research.patterns.confluence_zone import PATTERN as _CONFLUENCE
from simualpha_quant.research.patterns.generational_support import (
    PATTERN as _GENERATIONAL,
)
from simualpha_quant.research.patterns.impossible_level import PATTERN as _IMPOSSIBLE
from simualpha_quant.research.patterns.wave_2_at_618 import PATTERN as _WAVE_2
from simualpha_quant.research.patterns.wave_4_at_382 import PATTERN as _WAVE_4

PATTERNS: dict[str, PatternDef] = {
    p.name: p for p in (_WAVE_2, _WAVE_4, _CONFLUENCE, _GENERATIONAL, _IMPOSSIBLE)
}


def by_name(name: str) -> PatternDef:
    if name not in PATTERNS:
        raise KeyError(
            f"unknown pattern {name!r}. Known: {sorted(PATTERNS)}"
        )
    return PATTERNS[name]


def all_names() -> list[str]:
    return sorted(PATTERNS)
