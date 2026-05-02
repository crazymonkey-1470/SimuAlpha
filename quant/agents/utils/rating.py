# Forked from TauricResearch/TradingAgents — Apache 2.0
"""Deterministic 5-tier portfolio rating extractor.

The Portfolio Manager renders its decision to markdown that always
carries a ``**Rating**: X`` header. This parser pulls that rating out
without an extra LLM call.

Returns one of the five canonical strings:

    "Buy"  "Overweight"  "Hold"  "Underweight"  "Sell"

Falls back to ``"Hold"`` when no recognizable rating is present —
i.e. the safest possible interpretation of an ambiguous decision.
"""

from __future__ import annotations

import re

VALID_RATINGS: tuple[str, ...] = ("Buy", "Overweight", "Hold", "Underweight", "Sell")

# Match either the explicit `**Rating**: X` header or a bare last-line
# rating word at the end of the text. Case-insensitive throughout.
_RATING_HEADER = re.compile(
    r"\*?\*?rating\*?\*?\s*[:\-—]\s*(\w+)",
    re.IGNORECASE,
)


def parse_rating(text: str) -> str:
    """Extract one of the five canonical ratings from a PM decision.

    Args:
        text: PM-rendered markdown / plain text. May contain other prose.

    Returns:
        One of "Buy", "Overweight", "Hold", "Underweight", "Sell".
        Defaults to "Hold" when no rating can be identified.
    """
    if not text:
        return "Hold"

    # Prefer the explicit `**Rating**: X` header — that's what the PM
    # structured-output renderer always emits.
    match = _RATING_HEADER.search(text)
    if match:
        candidate = match.group(1).strip().capitalize()
        if candidate in VALID_RATINGS:
            return candidate

    # Fallback: scan for any standalone valid rating word.
    lowered = text.lower()
    for rating in VALID_RATINGS:
        if re.search(rf"\b{rating.lower()}\b", lowered):
            return rating

    return "Hold"
