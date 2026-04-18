"""Pure tool functions — consumed by both the HTTP API and the MCP server.

No transport (HTTP / MCP / CLI) logic lives in this module. Each public
function takes a Pydantic request model and returns a Pydantic response
model. Any new capability goes:

1. as a function here,
2. and an entry in `registry.TOOLS`.

Both the FastAPI app (`api/`) and the MCP server (`mcp/`) read from the
registry — do NOT write transport-specific wrappers inline.
"""

from simualpha_quant.tools.backtest_pattern import backtest_pattern
from simualpha_quant.tools.get_fundamentals import get_fundamentals
from simualpha_quant.tools.get_price_history import get_price_history
from simualpha_quant.tools.render_chart import render_tli_chart

__all__ = [
    "backtest_pattern",
    "get_fundamentals",
    "get_price_history",
    "render_tli_chart",
]
