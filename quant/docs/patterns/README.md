# TLI pattern library

Each `.md` here describes one named pattern registered in
`simualpha_quant.research.patterns.PATTERNS`. Pattern detectors are
pure functions — they take a single ticker's OHLCV and return the list
of dates the pattern fired.

| Pattern | Conviction tier | Needs |
| --- | --- | --- |
| [`wave_2_at_618`](./wave_2_at_618.md) | Primary entry | 50-day MA |
| [`wave_4_at_382`](./wave_4_at_382.md) | ADD zone | — |
| [`confluence_zone`](./confluence_zone.md) | +15 bonus | 200-week MA (4y history) |
| [`generational_support`](./generational_support.md) | +20 bonus | 200-month MA (17y history) |
| [`impossible_level`](./impossible_level.md) | Highest | 200MMA + 2y touch history |

All pattern detectors import their thresholds from
`simualpha_quant.tli_constants` — see `docs/tli-constants.md` for the
single source of truth.

## Adding a new pattern

1. Implement `detect(prices, params)` as a pure function in a new file
   under `simualpha_quant/research/patterns/`.
2. Wrap it in a `PatternDef` with default params + description.
3. Append to `PATTERNS` in `simualpha_quant/research/patterns/__init__.py`.
4. Add a matching `.md` here with file:line citations to any spec
   text or runtime code it derives from.
5. Add a unit test in `tests/research/test_patterns.py`.

The backtest engine and the `backtest_pattern` agent tool pick up
new patterns automatically.
