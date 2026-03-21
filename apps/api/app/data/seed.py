"""Deterministic seed data for SimuAlpha.

All mock data lives here. When real simulation engines are integrated,
services will read from computed state instead of this module.
"""

from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Regime
# ---------------------------------------------------------------------------

CURRENT_REGIME = {
    "regime": "fragile uptrend",
    "confidence": 0.72,
    "net_pressure": 0.18,
    "posture": "cautiously long, hedged tails",
    "risk_flags": [
        "left-tail risk remains underpriced relative to realized skew",
        "dealer gamma exposure shifting negative above 5650",
        "cross-asset momentum divergence widening (bonds vs equities)",
    ],
    "drivers": [
        {
            "factor": "passive inflows",
            "influence": 0.35,
            "description": "Systematic and passive allocators continue steady buying, providing a bid floor",
        },
        {
            "factor": "dealer gamma positioning",
            "influence": -0.15,
            "description": "Dealer support weakens under vol expansion; gamma flip zone near current levels",
        },
        {
            "factor": "momentum signal",
            "influence": 0.25,
            "description": "Medium-term trend followers remain aligned long, but conviction fading",
        },
        {
            "factor": "macro sentiment",
            "influence": -0.20,
            "description": "Rate uncertainty compressing risk appetite at the margin",
        },
    ],
    "summary": (
        "Short-covering and passive inflows dominate the bid side, sustaining a fragile uptrend. "
        "Dealer support weakens under vol expansion and the gamma flip zone sits uncomfortably "
        "close to spot. Trend followers remain net long but conviction is fading as cross-asset "
        "momentum diverges. The regime holds as long as passive flow absorbs supply, but "
        "vulnerability to a sharp reversal is elevated."
    ),
    "updated_at": datetime(2025, 3, 21, 16, 30, 0, tzinfo=timezone.utc).isoformat(),
}

REGIME_HISTORY = [
    {
        "date": "2025-03-21",
        "regime": "fragile uptrend",
        "confidence": 0.72,
        "net_pressure": 0.18,
        "summary": "Passive inflows sustain bid; dealer gamma weakening near flip zone",
    },
    {
        "date": "2025-03-20",
        "regime": "fragile uptrend",
        "confidence": 0.68,
        "net_pressure": 0.22,
        "summary": "Trend followers adding exposure; vol compression supports positioning",
    },
    {
        "date": "2025-03-19",
        "regime": "transitional",
        "confidence": 0.55,
        "net_pressure": 0.05,
        "summary": "Regime classification uncertain; conflicting signals across actor classes",
    },
    {
        "date": "2025-03-18",
        "regime": "range compression",
        "confidence": 0.78,
        "net_pressure": -0.02,
        "summary": "Low realized vol and balanced flows; market coiling ahead of catalyst",
    },
    {
        "date": "2025-03-17",
        "regime": "range compression",
        "confidence": 0.81,
        "net_pressure": -0.05,
        "summary": "Dealer hedging flows dominate; realized vol declining into expiry week",
    },
]

# ---------------------------------------------------------------------------
# Actors
# ---------------------------------------------------------------------------

CURRENT_ACTORS = [
    {
        "id": "actor-tf-01",
        "name": "Systematic Trend Followers",
        "archetype": "trend_follower",
        "bias": "bullish",
        "conviction": 0.62,
        "contribution": 0.20,
        "horizon": "2-6 weeks",
        "sensitivities": [
            {"factor": "price momentum", "weight": 0.85},
            {"factor": "volatility regime", "weight": -0.40},
        ],
        "recent_change": "Conviction declining from 0.78 as cross-asset momentum diverges",
        "confidence": 0.70,
    },
    {
        "id": "actor-mr-01",
        "name": "Statistical Mean Reverters",
        "archetype": "mean_reverter",
        "bias": "neutral",
        "conviction": 0.45,
        "contribution": -0.05,
        "horizon": "1-5 days",
        "sensitivities": [
            {"factor": "deviation from VWAP", "weight": 0.90},
            {"factor": "order book imbalance", "weight": 0.60},
        ],
        "recent_change": "Shifted from mildly bearish to neutral after intraday reversion completed",
        "confidence": 0.75,
    },
    {
        "id": "actor-od-01",
        "name": "Options Dealer Proxy",
        "archetype": "options_dealer",
        "bias": "neutral",
        "conviction": 0.80,
        "contribution": -0.12,
        "horizon": "intraday to weekly (gamma-dependent)",
        "sensitivities": [
            {"factor": "gamma exposure", "weight": 0.95},
            {"factor": "implied vol surface", "weight": 0.70},
            {"factor": "open interest concentration", "weight": 0.55},
        ],
        "recent_change": (
            "Gamma exposure shifting negative as spot approaches high-strike concentration; "
            "hedging flow becoming destabilizing"
        ),
        "confidence": 0.82,
    },
    {
        "id": "actor-pa-01",
        "name": "Passive Allocators",
        "archetype": "passive_allocator",
        "bias": "bullish",
        "conviction": 0.90,
        "contribution": 0.30,
        "horizon": "monthly rebalance cycle",
        "sensitivities": [
            {"factor": "fund flows", "weight": 0.95},
            {"factor": "calendar rebalance", "weight": 0.80},
        ],
        "recent_change": "Steady inflows continue; end-of-quarter rebalance expected to add to bid",
        "confidence": 0.88,
    },
    {
        "id": "actor-mn-01",
        "name": "Macro/News-Reactive Agents",
        "archetype": "macro_reactive",
        "bias": "bearish",
        "conviction": 0.55,
        "contribution": -0.15,
        "horizon": "event-driven, 1-10 days",
        "sensitivities": [
            {"factor": "rate expectations", "weight": 0.80},
            {"factor": "geopolitical risk index", "weight": 0.50},
            {"factor": "earnings surprise", "weight": 0.65},
        ],
        "recent_change": "Hawkish repricing of rate path increased bearish conviction this week",
        "confidence": 0.60,
    },
    {
        "id": "actor-ps-01",
        "name": "Panic Sellers",
        "archetype": "panic_seller",
        "bias": "neutral",
        "conviction": 0.15,
        "contribution": -0.02,
        "horizon": "reactive (hours to days)",
        "sensitivities": [
            {"factor": "drawdown magnitude", "weight": 0.95},
            {"factor": "VIX level", "weight": 0.80},
            {"factor": "media sentiment", "weight": 0.60},
        ],
        "recent_change": "Dormant; no activation trigger in current environment",
        "confidence": 0.85,
    },
    {
        "id": "actor-db-01",
        "name": "Dip Buyers",
        "archetype": "dip_buyer",
        "bias": "bullish",
        "conviction": 0.50,
        "contribution": 0.08,
        "horizon": "1-5 days post-dip",
        "sensitivities": [
            {"factor": "distance from support", "weight": 0.85},
            {"factor": "volume capitulation signal", "weight": 0.70},
        ],
        "recent_change": "Latent demand identified at 2% below spot; no trigger yet",
        "confidence": 0.65,
    },
]

# ---------------------------------------------------------------------------
# Scenarios
# ---------------------------------------------------------------------------

CURRENT_SCENARIOS = {
    "base_case_id": "scenario-base",
    "scenarios": [
        {
            "id": "scenario-base",
            "name": "Grinding continuation",
            "probability": 0.50,
            "direction": "mildly bullish",
            "drivers": [
                "Passive inflows sustain bid floor",
                "Vol remains compressed through expiry",
                "No macro catalyst forces repositioning",
            ],
            "invalidation_conditions": [
                "VIX closes above 22 for two consecutive sessions",
                "Passive flow estimates turn negative",
            ],
            "actor_reactions": [
                {
                    "actor_archetype": "trend_follower",
                    "expected_behavior": "Maintain long bias with slowly declining conviction",
                },
                {
                    "actor_archetype": "passive_allocator",
                    "expected_behavior": "Continue steady allocation through rebalance window",
                },
            ],
            "risk_level": "moderate",
            "notes": (
                "The path of least resistance remains higher as long as passive flow absorbs "
                "opportunistic supply. This is a low-energy advance vulnerable to exogenous shock."
            ),
        },
        {
            "id": "scenario-vol-expansion",
            "name": "Volatility expansion and dealer destabilization",
            "probability": 0.25,
            "direction": "bearish",
            "drivers": [
                "Dealers flip to negative gamma as spot breaches concentration zone",
                "Realized vol spikes trigger CTA de-risking",
                "Macro event reprices rate path",
            ],
            "invalidation_conditions": [
                "Spot holds above gamma flip level for 3+ sessions",
                "Implied vol collapses back below 15",
            ],
            "actor_reactions": [
                {
                    "actor_archetype": "options_dealer",
                    "expected_behavior": "Hedging flows amplify moves; dealer becomes destabilizing",
                },
                {
                    "actor_archetype": "panic_seller",
                    "expected_behavior": "Activates if drawdown exceeds 3% from highs",
                },
                {
                    "actor_archetype": "dip_buyer",
                    "expected_behavior": "Engages at support levels but may be overwhelmed by flow",
                },
            ],
            "risk_level": "elevated",
            "notes": (
                "Dealer gamma positioning creates fragility near current levels. A catalyst "
                "that pushes spot through the flip zone could trigger self-reinforcing selling "
                "as dealers hedge dynamically."
            ),
        },
        {
            "id": "scenario-breakout",
            "name": "Momentum breakout with short squeeze",
            "probability": 0.15,
            "direction": "bullish",
            "drivers": [
                "Positive macro surprise compresses risk premia",
                "Short covering cascade in underweight sectors",
                "FOMO-driven retail inflows amplify move",
            ],
            "invalidation_conditions": [
                "Breadth fails to confirm new highs",
                "Volume declines into breakout (exhaustion signal)",
            ],
            "actor_reactions": [
                {
                    "actor_archetype": "trend_follower",
                    "expected_behavior": "Conviction surges; aggressive position building",
                },
                {
                    "actor_archetype": "mean_reverter",
                    "expected_behavior": "Fades the move initially; forced to cover if momentum persists",
                },
            ],
            "risk_level": "moderate",
            "notes": (
                "A positive catalyst combined with light positioning could produce an outsized "
                "move. Short interest in key sectors provides fuel for a squeeze."
            ),
        },
        {
            "id": "scenario-macro-shock",
            "name": "Exogenous macro shock",
            "probability": 0.10,
            "direction": "sharply bearish",
            "drivers": [
                "Unexpected geopolitical escalation or credit event",
                "Liquidity withdrawal across asset classes",
                "Correlation spike invalidates diversification assumptions",
            ],
            "invalidation_conditions": [
                "Geopolitical risk index remains below elevated threshold",
                "Credit spreads stay contained",
            ],
            "actor_reactions": [
                {
                    "actor_archetype": "panic_seller",
                    "expected_behavior": "Full activation; indiscriminate liquidation",
                },
                {
                    "actor_archetype": "macro_reactive",
                    "expected_behavior": "Rapid de-risking; flight to quality",
                },
                {
                    "actor_archetype": "passive_allocator",
                    "expected_behavior": "Continues buying mechanically; becomes sole bid-side support",
                },
            ],
            "risk_level": "high",
            "notes": (
                "Low-probability but high-impact tail scenario. Current pricing of tail risk "
                "appears insufficient given elevated geopolitical uncertainty."
            ),
        },
    ],
}

# ---------------------------------------------------------------------------
# Signals
# ---------------------------------------------------------------------------

CURRENT_SIGNAL = {
    "bias": "mildly bullish",
    "confidence": 0.62,
    "time_horizon": "1-2 weeks",
    "suggested_posture": "maintain core long exposure with tail hedges; reduce on strength above resistance",
    "warnings": [
        "Conviction declining as cross-asset divergence widens",
        "Signal strength below threshold for aggressive positioning",
        "Dealer gamma flip zone creates binary risk near spot",
    ],
    "change_vs_prior": (
        "Bias unchanged from prior period but confidence decreased from 0.71 to 0.62. "
        "The weakening is driven by deteriorating momentum breadth and rising macro uncertainty."
    ),
    "updated_at": datetime(2025, 3, 21, 16, 30, 0, tzinfo=timezone.utc).isoformat(),
}

SIGNAL_HISTORY = [
    {
        "date": "2025-03-21",
        "bias": "mildly bullish",
        "confidence": 0.62,
        "suggested_posture": "cautiously long, hedged tails",
        "summary": "Passive bid sustains uptrend but conviction fading on momentum divergence",
    },
    {
        "date": "2025-03-20",
        "bias": "mildly bullish",
        "confidence": 0.71,
        "suggested_posture": "long with trailing protection",
        "summary": "Trend alignment supports constructive bias; vol compression favorable",
    },
    {
        "date": "2025-03-19",
        "bias": "neutral",
        "confidence": 0.48,
        "suggested_posture": "reduced exposure, await clarity",
        "summary": "Conflicting actor signals; regime classification uncertain",
    },
    {
        "date": "2025-03-18",
        "bias": "neutral",
        "confidence": 0.55,
        "suggested_posture": "balanced book, no directional tilt",
        "summary": "Range-bound regime with low vol; no actionable signal",
    },
    {
        "date": "2025-03-17",
        "bias": "mildly bearish",
        "confidence": 0.58,
        "suggested_posture": "light short bias via options structures",
        "summary": "Macro repricing pressures offset by dealer support into expiry",
    },
]

# ---------------------------------------------------------------------------
# Cross-asset context
# ---------------------------------------------------------------------------

CROSS_ASSET_CONTEXT = {
    "as_of": "2025-03-21T16:30:00Z",
    "entries": [
        {
            "instrument": "SPX",
            "last_price": 5667.50,
            "change_pct": 0.28,
            "volatility_state": "normal",
            "trend_state": "uptrend",
            "notes": "Grinding higher on passive flow; breadth narrowing",
        },
        {
            "instrument": "NDX",
            "last_price": 19842.00,
            "change_pct": 0.42,
            "volatility_state": "normal",
            "trend_state": "uptrend",
            "notes": "Mega-cap concentration supporting index; equal-weight lagging",
        },
        {
            "instrument": "VIX",
            "last_price": 16.80,
            "change_pct": -2.10,
            "volatility_state": "compressed",
            "trend_state": "downtrend",
            "notes": "Below historical mean; term structure in contango",
        },
        {
            "instrument": "US10Y",
            "last_price": 4.32,
            "change_pct": 0.08,
            "volatility_state": "elevated",
            "trend_state": "range-bound",
            "notes": "Rate vol elevated relative to equity vol; divergence notable",
        },
        {
            "instrument": "DXY",
            "last_price": 104.25,
            "change_pct": 0.15,
            "volatility_state": "normal",
            "trend_state": "range-bound",
            "notes": "Dollar strength containing EM inflows; mild headwind for commodities",
        },
        {
            "instrument": "HYG",
            "last_price": 77.40,
            "change_pct": 0.05,
            "volatility_state": "compressed",
            "trend_state": "uptrend",
            "notes": "Credit spreads tight; no stress signal from high yield",
        },
        {
            "instrument": "GLD",
            "last_price": 198.50,
            "change_pct": -0.35,
            "volatility_state": "normal",
            "trend_state": "uptrend",
            "notes": "Consolidating near highs; central bank demand supports floor",
        },
    ],
}

# ---------------------------------------------------------------------------
# System status
# ---------------------------------------------------------------------------

SYSTEM_STATUS = {
    "api_status": "operational",
    "data_freshness": "market data as of 2025-03-21 16:30 UTC",
    "last_simulation_run": datetime(2025, 3, 21, 14, 0, 0, tzinfo=timezone.utc).isoformat(),
    "calibration_status": "calibrated — last full calibration 2025-03-21 06:00 UTC",
    "worker_status": "idle",
    "active_model_version": "sa-sim-0.4.2",
    "warnings": [
        "Options flow data delayed by ~15 minutes due to vendor lag",
        "Worker queue depth: 0 (idle)",
    ],
}

# ---------------------------------------------------------------------------
# Replay (historical snapshot for a specific date)
# ---------------------------------------------------------------------------

REPLAY_FRAMES: dict[str, dict] = {
    "2025-03-18": {
        "date": "2025-03-18",
        "regime": "range compression",
        "regime_confidence": 0.78,
        "net_pressure": -0.02,
        "actor_states": [
            {
                "id": "actor-tf-01",
                "name": "Systematic Trend Followers",
                "archetype": "trend_follower",
                "bias": "neutral",
                "conviction": 0.40,
                "contribution": 0.05,
                "horizon": "2-6 weeks",
                "sensitivities": [
                    {"factor": "price momentum", "weight": 0.85},
                    {"factor": "volatility regime", "weight": -0.40},
                ],
                "recent_change": "Reduced long exposure as momentum signals flattened",
                "confidence": 0.65,
            },
            {
                "id": "actor-od-01",
                "name": "Options Dealer Proxy",
                "archetype": "options_dealer",
                "bias": "bullish",
                "conviction": 0.75,
                "contribution": 0.15,
                "horizon": "intraday to weekly (gamma-dependent)",
                "sensitivities": [
                    {"factor": "gamma exposure", "weight": 0.95},
                    {"factor": "implied vol surface", "weight": 0.70},
                    {"factor": "open interest concentration", "weight": 0.55},
                ],
                "recent_change": "Positive gamma positioning providing stabilizing hedging flows",
                "confidence": 0.80,
            },
            {
                "id": "actor-pa-01",
                "name": "Passive Allocators",
                "archetype": "passive_allocator",
                "bias": "bullish",
                "conviction": 0.88,
                "contribution": 0.28,
                "horizon": "monthly rebalance cycle",
                "sensitivities": [
                    {"factor": "fund flows", "weight": 0.95},
                    {"factor": "calendar rebalance", "weight": 0.80},
                ],
                "recent_change": "Pre-quarter-end flows beginning to build",
                "confidence": 0.85,
            },
        ],
        "scenario_branches": [
            {
                "id": "scenario-base-0318",
                "name": "Continued range compression",
                "probability": 0.55,
                "direction": "neutral",
                "drivers": ["Low vol into expiry", "Balanced positioning"],
                "invalidation_conditions": ["Realized vol exceeds 12 annualized"],
                "actor_reactions": [
                    {
                        "actor_archetype": "options_dealer",
                        "expected_behavior": "Positive gamma keeps selling vol on rallies",
                    },
                ],
                "risk_level": "low",
                "notes": "Quiet tape expected through Friday expiry",
            },
        ],
        "realized_outcome": (
            "Range compression held through the session. SPX moved 12bps with "
            "declining volume. Dealer gamma remained positive and stabilizing."
        ),
        "notes": "Classic pre-expiry compression pattern; all actor signals aligned with low-vol regime",
    },
}
