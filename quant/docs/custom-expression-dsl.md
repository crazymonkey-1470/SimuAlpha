# Custom expression DSL

A minimal JSON DSL for describing ad-hoc patterns without writing
Python. Consumed by `backtest_pattern` via the `custom_expression`
field. Every node is a single-key JSON object `{op: args}`; the full
grammar is small enough to memorize.

## When to use the DSL vs a named pattern

- **Named pattern** (`pattern_name`): a known TLI setup from the
  library. Cheaper to call, already tuned, already unit-tested.
- **Custom expression** (`custom_expression`): a novel hypothesis the
  agent wants to try (e.g. "price within 1 % of 200-day MA AND 20 %
  above its 52-week low"). You compose it; the engine validates,
  evaluates, and returns hit-rate stats.

If a custom expression proves useful over time, promote it to a named
pattern by committing a detector in
`simualpha_quant.research.patterns/`.

## Grammar

### Top level

The root is a single-key dict. The key is one of the **combinators** or
**predicates** below. The value shape depends on the operator.

### Combinators

| Op | Args | Returns |
| --- | --- | --- |
| `all` | `[node, node, …]` | bar-by-bar boolean series, true where ALL children are true |
| `any` | `[node, node, …]` | true where ANY child is true |
| `not` | `node` | negation |

### Predicates

| Op | Args | Meaning |
| --- | --- | --- |
| `gt` | `{a, b}` | `a > b` (per bar) |
| `lt` | `{a, b}` | `a < b` |
| `ge` | `{a, b}` | `a >= b` |
| `le` | `{a, b}` | `a <= b` |
| `eq` | `{a, b}` | `a == b` |
| `between` | `{value, low, high}` | `low <= value <= high` |
| `distance_pct` | `{a, b, max}` | `|a - b| / |b| <= max` |

### Operands

Operands appear as values of `a` / `b` / `value` / `low` / `high`. Each
resolves to either a **per-bar series** or a **scalar**.

| Operand | Shape | Meaning |
| --- | --- | --- |
| `42.5` | literal | scalar |
| `"$close"` | field ref | close-price series |
| `"$open"`, `"$high"`, `"$low"`, `"$volume"` | field refs | the obvious |
| `{"sma": [field, period, freq]}` | compound | `freq ∈ {daily, weekly, monthly}` |
| `{"ema": [field, period]}` | compound | exponential MA on daily bars |
| `{"fib": [level, "wave_1"]}` | compound | Fib retracement of the currently-developing Wave 1 |
| `{"wave_anchor": ["wave_1", "start"\|"end"\|"low"\|"high"]}` | compound | raw anchor price |

Wave operands use the most recent developing Wave 2 anchors from the
input price series. If no Wave 1 has formed yet, they resolve to NaN
and predicates against them evaluate false.

## Worked examples

### Re-creating `wave_2_at_618`

```json
{
  "all": [
    {"between": {
      "value": "$close",
      "low":  {"fib": [0.618, "wave_1"]},
      "high": {"fib": [0.5,   "wave_1"]}
    }},
    {"gt": {"a": "$close", "b": {"sma": ["$close", 50, "daily"]}}}
  ]
}
```

Price inside the 0.5–0.618 band of Wave 1, confirmed above the 50-day SMA.

### Re-creating `confluence_zone`

```json
{
  "all": [
    {"distance_pct": {
      "a": {"sma": ["$close", 200, "weekly"]},
      "b": {"fib": [0.618, "wave_1"]},
      "max": 0.03
    }},
    {"distance_pct": {
      "a": "$close",
      "b": {"fib": [0.618, "wave_1"]},
      "max": 0.03
    }},
    {"distance_pct": {
      "a": "$close",
      "b": {"sma": ["$close", 200, "weekly"]},
      "max": 0.03
    }}
  ]
}
```

### "Dip near the 50-day, above the 200-day"

```json
{
  "all": [
    {"distance_pct": {
      "a": "$close",
      "b": {"sma": ["$close", 50, "daily"]},
      "max": 0.02
    }},
    {"gt": {"a": "$close", "b": {"sma": ["$close", 200, "daily"]}}}
  ]
}
```

### "EMA-21 above EMA-55 AND close made a new 60-day high"

EMA cross is easy. New highs over a trailing window are not in the
current DSL — if the agent needs that, it should promote the pattern
to a named detector. The DSL deliberately stays simple; complex stateful
logic belongs in Python.

## Errors

Any structural problem raises `DSLError` with the offending node
printed. Common causes:

- Unknown operator at the top level ("magic", "cross", etc.).
- Operand is not a literal, `$field`, or single-key dict.
- `sma` / `ema` given the wrong number of args.
- `fib` with `wave ≠ "wave_1"` — Stage 3 only knows about Wave 1.

## Stage 3 scope note

The DSL is intentionally small. Anything it can't express (lookbacks
over multiple waves, cross-asset constraints, complex cross-overs)
should become a named pattern in Python. The DSL exists so the agent
can validate novel hypotheses without shipping a code change — not to
replace the pattern library.
