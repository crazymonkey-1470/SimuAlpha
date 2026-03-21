"""Domain vocabulary for SimuAlpha simulation generation.

These lists provide the building blocks that generators sample from
to produce realistic, internally-consistent simulation outputs.
Real calibration logic will replace seeded selection with model-driven
inference, but the vocabulary remains useful for labeling and display.
"""

# ── Regime labels ────────────────────────────────────────────────────────────

REGIME_LABELS: list[str] = [
    "fragile uptrend",
    "trend-up",
    "trend-down",
    "range compression",
    "squeeze",
    "macro risk-on",
    "macro risk-off",
    "panic",
    "unstable rally",
    "chop",
    "transitional",
    "vol expansion",
    "mean reversion",
]

# ── Actor archetypes with static metadata ────────────────────────────────────

ACTOR_ARCHETYPES: list[dict] = [
    {
        "id": "actor-tf-01",
        "name": "Systematic Trend Followers",
        "archetype": "trend_follower",
        "horizon": "2-6 weeks",
        "sensitivities": [
            {"factor": "price momentum", "weight": 0.85},
            {"factor": "volatility regime", "weight": -0.40},
        ],
    },
    {
        "id": "actor-mr-01",
        "name": "Statistical Mean Reverters",
        "archetype": "mean_reverter",
        "horizon": "1-5 days",
        "sensitivities": [
            {"factor": "deviation from VWAP", "weight": 0.90},
            {"factor": "order book imbalance", "weight": 0.60},
        ],
    },
    {
        "id": "actor-od-01",
        "name": "Options Dealer Proxy",
        "archetype": "options_dealer",
        "horizon": "intraday to weekly (gamma-dependent)",
        "sensitivities": [
            {"factor": "gamma exposure", "weight": 0.95},
            {"factor": "implied vol surface", "weight": 0.70},
            {"factor": "open interest concentration", "weight": 0.55},
        ],
    },
    {
        "id": "actor-pa-01",
        "name": "Passive Allocators",
        "archetype": "passive_allocator",
        "horizon": "monthly rebalance cycle",
        "sensitivities": [
            {"factor": "fund flows", "weight": 0.95},
            {"factor": "calendar rebalance", "weight": 0.80},
        ],
    },
    {
        "id": "actor-mn-01",
        "name": "Macro/News-Reactive Agents",
        "archetype": "macro_reactive",
        "horizon": "event-driven, 1-10 days",
        "sensitivities": [
            {"factor": "rate expectations", "weight": 0.80},
            {"factor": "geopolitical risk index", "weight": 0.50},
            {"factor": "earnings surprise", "weight": 0.65},
        ],
    },
    {
        "id": "actor-ps-01",
        "name": "Panic Sellers",
        "archetype": "panic_seller",
        "horizon": "reactive (hours to days)",
        "sensitivities": [
            {"factor": "drawdown magnitude", "weight": 0.95},
            {"factor": "VIX level", "weight": 0.80},
            {"factor": "media sentiment", "weight": 0.60},
        ],
    },
    {
        "id": "actor-db-01",
        "name": "Dip Buyers",
        "archetype": "dip_buyer",
        "horizon": "1-5 days post-dip",
        "sensitivities": [
            {"factor": "distance from support", "weight": 0.85},
            {"factor": "volume capitulation signal", "weight": 0.70},
        ],
    },
]

# ── Bias and direction vocabulary ────────────────────────────────────────────

BIASES: list[str] = ["bullish", "bearish", "neutral"]
SIGNAL_BIASES: list[str] = ["bullish", "mildly bullish", "neutral", "mildly bearish", "bearish"]
DIRECTIONS: list[str] = ["bullish", "mildly bullish", "neutral", "bearish", "sharply bearish"]
RISK_LEVELS: list[str] = ["low", "moderate", "elevated", "high"]
VOLATILITY_STATES: list[str] = ["compressed", "normal", "elevated"]
TREND_STATES: list[str] = ["uptrend", "downtrend", "range-bound"]

# ── Posture phrases ──────────────────────────────────────────────────────────

POSTURE_PHRASES: list[str] = [
    "cautiously long, hedged tails",
    "long with trailing protection",
    "reduced exposure, await clarity",
    "balanced book, no directional tilt",
    "light short bias via options structures",
    "maximum defensive; cash and convexity",
    "tactically long with tight stops",
    "neutral with convex hedge overlay",
    "maintain core long exposure with tail hedges; reduce on strength above resistance",
]

# ── Risk flag fragments ──────────────────────────────────────────────────────

RISK_FLAG_FRAGMENTS: list[str] = [
    "left-tail risk remains underpriced relative to realized skew",
    "dealer gamma exposure shifting negative above {level}",
    "cross-asset momentum divergence widening (bonds vs equities)",
    "liquidity depth thinning into event window",
    "vol-of-vol elevated; hedging costs rising",
    "short interest in key sectors approaching squeeze threshold",
    "breadth deterioration diverging from index performance",
    "credit spread compression masking underlying stress",
    "rate volatility elevated relative to equity vol",
    "correlation regime shifting; diversification assumptions weakening",
]

# ── Driver factor names ──────────────────────────────────────────────────────

DRIVER_FACTORS: list[str] = [
    "passive inflows",
    "dealer gamma positioning",
    "momentum signal",
    "macro sentiment",
    "rate expectations",
    "credit conditions",
    "earnings revisions",
    "geopolitical risk premium",
    "volatility term structure",
    "short covering flow",
    "options hedging pressure",
    "fund rebalance demand",
]

# ── Driver description templates ─────────────────────────────────────────────

DRIVER_DESCRIPTIONS: dict[str, list[str]] = {
    "passive inflows": [
        "Systematic and passive allocators continue steady buying, providing a bid floor",
        "Passive flow estimates remain positive; end-of-period rebalancing adds incremental demand",
    ],
    "dealer gamma positioning": [
        "Dealer support weakens under vol expansion; gamma flip zone near current levels",
        "Positive gamma positioning providing stabilizing hedging flows",
        "Dealer hedging flows becoming destabilizing as spot approaches high-strike concentration",
    ],
    "momentum signal": [
        "Medium-term trend followers remain aligned long, but conviction fading",
        "Momentum signals strengthening across timeframes; trend followers adding exposure",
        "Momentum signals flattening; trend followers reducing position size",
    ],
    "macro sentiment": [
        "Rate uncertainty compressing risk appetite at the margin",
        "Macro backdrop supportive; growth expectations stabilizing",
        "Hawkish repricing increasing uncertainty; risk appetite contracting",
    ],
}

# ── Narrative summary templates ──────────────────────────────────────────────

SUMMARY_TEMPLATES: list[str] = [
    "Short-covering and passive inflows dominate the bid side, sustaining a {regime}. {driver_context} The regime holds as long as passive flow absorbs supply, but vulnerability to a sharp reversal is {risk_adj}.",
    "Dealer support {dealer_state} and the gamma flip zone sits {proximity} spot. Trend followers remain net long but conviction is {conviction_state} as cross-asset momentum diverges.",
    "Macro risk-off pressure remains contained but unresolved. {driver_context} Actor positioning is {positioning_state}, with {dominant_actor} providing the primary directional influence.",
    "The market is in a {regime} characterized by {characteristic}. {driver_context} Structural fragility is {fragility_state} given current dealer positioning and momentum breadth.",
    "Volatility compression continues as balanced flows limit directional resolution. {driver_context} The setup favors {outlook} but tail risk pricing appears insufficient.",
]

# ── Scenario templates ───────────────────────────────────────────────────────

SCENARIO_TEMPLATES: list[dict] = [
    {
        "id_suffix": "base",
        "name": "Grinding continuation",
        "direction": "mildly bullish",
        "risk_level": "moderate",
        "prob_range": (0.40, 0.55),
        "drivers": [
            "Passive inflows sustain bid floor",
            "Vol remains compressed through expiry",
            "No macro catalyst forces repositioning",
        ],
        "invalidation": [
            "VIX closes above 22 for two consecutive sessions",
            "Passive flow estimates turn negative",
        ],
    },
    {
        "id_suffix": "vol-expansion",
        "name": "Volatility expansion and dealer destabilization",
        "direction": "bearish",
        "risk_level": "elevated",
        "prob_range": (0.18, 0.30),
        "drivers": [
            "Dealers flip to negative gamma as spot breaches concentration zone",
            "Realized vol spikes trigger CTA de-risking",
            "Macro event reprices rate path",
        ],
        "invalidation": [
            "Spot holds above gamma flip level for 3+ sessions",
            "Implied vol collapses back below 15",
        ],
    },
    {
        "id_suffix": "breakout",
        "name": "Momentum breakout with short squeeze",
        "direction": "bullish",
        "risk_level": "moderate",
        "prob_range": (0.10, 0.20),
        "drivers": [
            "Positive macro surprise compresses risk premia",
            "Short covering cascade in underweight sectors",
            "FOMO-driven retail inflows amplify move",
        ],
        "invalidation": [
            "Breadth fails to confirm new highs",
            "Volume declines into breakout (exhaustion signal)",
        ],
    },
    {
        "id_suffix": "macro-shock",
        "name": "Exogenous macro shock",
        "direction": "sharply bearish",
        "risk_level": "high",
        "prob_range": (0.05, 0.15),
        "drivers": [
            "Unexpected geopolitical escalation or credit event",
            "Liquidity withdrawal across asset classes",
            "Correlation spike invalidates diversification assumptions",
        ],
        "invalidation": [
            "Geopolitical risk index remains below elevated threshold",
            "Credit spreads stay contained",
        ],
    },
]

# ── Actor reaction templates per scenario ────────────────────────────────────

ACTOR_REACTIONS: dict[str, dict[str, str]] = {
    "base": {
        "trend_follower": "Maintain long bias with slowly declining conviction",
        "passive_allocator": "Continue steady allocation through rebalance window",
        "mean_reverter": "Fade minor extensions; overall neutral positioning",
    },
    "vol-expansion": {
        "options_dealer": "Hedging flows amplify moves; dealer becomes destabilizing",
        "panic_seller": "Activates if drawdown exceeds 3% from highs",
        "dip_buyer": "Engages at support levels but may be overwhelmed by flow",
        "trend_follower": "De-risks as volatility regime shifts unfavorably",
    },
    "breakout": {
        "trend_follower": "Conviction surges; aggressive position building",
        "mean_reverter": "Fades the move initially; forced to cover if momentum persists",
        "passive_allocator": "Mechanical buying continues; provides additional fuel",
    },
    "macro-shock": {
        "panic_seller": "Full activation; indiscriminate liquidation",
        "macro_reactive": "Rapid de-risking; flight to quality",
        "passive_allocator": "Continues buying mechanically; becomes sole bid-side support",
    },
}

# ── Recent change phrases per archetype ──────────────────────────────────────

RECENT_CHANGE_PHRASES: dict[str, list[str]] = {
    "trend_follower": [
        "Conviction declining from {prev:.2f} as cross-asset momentum diverges",
        "Adding exposure as momentum signals align across timeframes",
        "Reduced long exposure as momentum signals flattened",
        "Position size unchanged; signals near threshold for additional allocation",
    ],
    "mean_reverter": [
        "Shifted from mildly bearish to neutral after intraday reversion completed",
        "Positioning for mean reversion as deviation from VWAP extends",
        "Neutral; no actionable deviation from fair value detected",
    ],
    "options_dealer": [
        "Gamma exposure shifting negative as spot approaches high-strike concentration; hedging flow becoming destabilizing",
        "Positive gamma positioning providing stabilizing hedging flows",
        "Gamma neutral near current levels; dealer flow has minimal directional impact",
    ],
    "passive_allocator": [
        "Steady inflows continue; end-of-quarter rebalance expected to add to bid",
        "Pre-quarter-end flows beginning to build",
        "Rebalance flows completed; returning to baseline allocation pace",
    ],
    "macro_reactive": [
        "Hawkish repricing of rate path increased bearish conviction this week",
        "Dovish tilt in forward guidance reduced bearish pressure",
        "Elevated event uncertainty; maintaining defensive posture pending data",
    ],
    "panic_seller": [
        "Dormant; no activation trigger in current environment",
        "Low-level anxiety present but below activation threshold",
        "Partially activated after intraday drawdown; subsiding as market stabilizes",
    ],
    "dip_buyer": [
        "Latent demand identified at {pct}% below spot; no trigger yet",
        "Engaged after recent pullback; absorbing supply near support",
        "Exhausted after recent buying; reloading threshold lower",
    ],
}

# ── Signal warning phrases ───────────────────────────────────────────────────

SIGNAL_WARNINGS: list[str] = [
    "Conviction declining as cross-asset divergence widens",
    "Signal strength below threshold for aggressive positioning",
    "Dealer gamma flip zone creates binary risk near spot",
    "Event risk window approaching; signal reliability may decrease",
    "Momentum breadth deteriorating despite index strength",
    "Rate volatility unresolved; macro overlay weakens signal",
    "Elevated correlation regime reduces diversification benefit",
]

# ── Cross-asset instruments ──────────────────────────────────────────────────

INSTRUMENTS: list[dict] = [
    {"instrument": "SPX", "base_price": 5667.50, "typical_change": 0.30},
    {"instrument": "NDX", "base_price": 19842.00, "typical_change": 0.45},
    {"instrument": "VIX", "base_price": 16.80, "typical_change": 2.00},
    {"instrument": "US10Y", "base_price": 4.32, "typical_change": 0.10},
    {"instrument": "DXY", "base_price": 104.25, "typical_change": 0.20},
    {"instrument": "HYG", "base_price": 77.40, "typical_change": 0.10},
    {"instrument": "GLD", "base_price": 198.50, "typical_change": 0.40},
]

INSTRUMENT_NOTES: dict[str, list[str]] = {
    "SPX": [
        "Grinding higher on passive flow; breadth narrowing",
        "Consolidating near highs; dealer support stabilizing",
        "Selling pressure absorbed by passive allocators",
    ],
    "NDX": [
        "Mega-cap concentration supporting index; equal-weight lagging",
        "Tech leadership broadening modestly",
        "AI-related names driving disproportionate contribution",
    ],
    "VIX": [
        "Below historical mean; term structure in contango",
        "Compressing further into expiry; supply overwhelming demand",
        "Bid emerging in short-dated puts; tail hedging activity increasing",
    ],
    "US10Y": [
        "Rate vol elevated relative to equity vol; divergence notable",
        "Yield curve steepening; front-end anchored by expectations",
        "Duration selling pressuring long end; curve dynamics shifting",
    ],
    "DXY": [
        "Dollar strength containing EM inflows; mild headwind for commodities",
        "Range-bound; awaiting clarity on relative monetary policy divergence",
        "Dollar weakening on positioning unwind; supportive for risk assets",
    ],
    "HYG": [
        "Credit spreads tight; no stress signal from high yield",
        "Spreads widening modestly but well within historical range",
        "New issuance well absorbed; credit conditions benign",
    ],
    "GLD": [
        "Consolidating near highs; central bank demand supports floor",
        "Safe-haven bid emerging as macro uncertainty rises",
        "Consolidating after recent advance; real rate dynamics supportive",
    ],
}
