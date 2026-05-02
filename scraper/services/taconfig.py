# Forked from TauricResearch/TradingAgents — Apache 2.0
"""
Standalone configuration for data pipeline.
This module replaces TradingAgents' config which depended on tradingagents.default_config.
"""

from typing import Dict, Optional

# SimuAlpha default configuration for data pipeline
DEFAULT_CONFIG: Dict = {
    "data_vendors": {
        "core_stock_apis": "yfinance",
        "technical_indicators": "yfinance",
        "fundamental_data": "alpha_vantage",
        "news_data": "yfinance",
    },
    "tool_vendors": {},
    "data_cache_dir": "/tmp/SimuAlpha/.cache/data",
    "results_dir": "/tmp/SimuAlpha/.cache/results",
    "max_debate_rounds": 1,
    "max_risk_discuss_rounds": 1,
    "output_language": "English",
}

_config: Optional[Dict] = None


def initialize_config():
    """Initialize the configuration with default values."""
    global _config
    if _config is None:
        _config = DEFAULT_CONFIG.copy()


def set_config(config: Dict):
    """Update the configuration with custom values."""
    global _config
    if _config is None:
        _config = DEFAULT_CONFIG.copy()
    _config.update(config)


def get_config() -> Dict:
    """Get the current configuration."""
    if _config is None:
        initialize_config()
    return _config.copy()


# Initialize with default config
initialize_config()