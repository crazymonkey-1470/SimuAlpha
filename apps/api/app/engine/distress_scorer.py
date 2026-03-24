"""Distress scoring engine.

Computes a multi-factor distress risk assessment from standardized financial data.
The model combines liquidity, leverage, profitability, cash flow, and solvency
indicators into a weighted composite score with explainable narrative output.

Score range: 0-100 (higher = more distress risk)
Rating scale: Low (0-25) / Moderate (26-50) / High (51-75) / Severe (76-100)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.engine.data_provider import FinancialData


@dataclass
class DistressMetrics:
    """Computed distress metrics from raw financial data."""

    # Liquidity
    current_ratio: float | None = None
    cash_to_debt: float | None = None
    working_capital_ratio: float | None = None

    # Leverage
    debt_to_equity: float | None = None
    debt_to_assets: float | None = None
    debt_to_ebitda: float | None = None
    equity_negative: bool = False

    # Profitability
    operating_margin: float | None = None
    net_margin: float | None = None
    operating_margin_trend: str | None = None  # improving / stable / deteriorating
    net_income_trend: str | None = None

    # Cash flow
    ocf_positive: bool | None = None
    fcf_positive: bool | None = None
    ocf_trend: str | None = None
    fcf_trend: str | None = None
    cash_burn_months: float | None = None

    # Interest coverage
    interest_coverage: float | None = None

    # Dilution
    shares_change_pct: float | None = None
    dilution_risk: str | None = None  # low / moderate / high

    # Altman Z-Score components
    altman_z: float | None = None

    # Revenue
    revenue_trend: str | None = None


@dataclass
class DistressAssessment:
    """Complete distress assessment output."""

    ticker: str
    company_name: str
    sector: str | None
    industry: str | None
    period_end: str | None

    distress_rating: str  # Low / Moderate / High / Severe
    distress_score: float  # 0-100

    executive_summary: str
    why_safe: list[str]
    key_risks: list[str]
    stabilizing_factors: list[str]
    what_to_watch: list[str]

    liquidity_analysis: str
    leverage_analysis: str
    profitability_analysis: str
    cashflow_analysis: str
    interest_coverage_analysis: str
    dilution_risk_analysis: str
    long_term_trend_analysis: str
    hold_context: str
    analyst_notes: str

    metrics: DistressMetrics
    raw_metrics: dict[str, Any] = field(default_factory=dict)


def _safe_div(a: float | None, b: float | None) -> float | None:
    if a is None or b is None or b == 0:
        return None
    return a / b


def _trend(current: float | None, prior: float | None) -> str | None:
    if current is None or prior is None:
        return None
    if current > prior * 1.05:
        return "improving"
    if current < prior * 0.95:
        return "deteriorating"
    return "stable"


def _fmt(val: float | None, pct: bool = False) -> str:
    if val is None:
        return "N/A"
    if pct:
        return f"{val * 100:.1f}%"
    return f"{val:,.2f}"


def _fmt_big(val: float | None) -> str:
    if val is None:
        return "N/A"
    abs_val = abs(val)
    sign = "-" if val < 0 else ""
    if abs_val >= 1e12:
        return f"{sign}${abs_val / 1e12:.1f}T"
    if abs_val >= 1e9:
        return f"{sign}${abs_val / 1e9:.1f}B"
    if abs_val >= 1e6:
        return f"{sign}${abs_val / 1e6:.0f}M"
    return f"{sign}${abs_val:,.0f}"


def compute_metrics(data: FinancialData) -> DistressMetrics:
    """Compute all distress metrics from raw financial data."""
    m = DistressMetrics()

    # Liquidity
    m.current_ratio = data.current_ratio or _safe_div(data.current_assets, data.current_liabilities)
    m.cash_to_debt = _safe_div(data.cash_and_equivalents, data.total_debt) if data.total_debt and data.total_debt > 0 else None
    if data.working_capital is not None and data.total_assets:
        m.working_capital_ratio = data.working_capital / data.total_assets

    # Leverage
    m.debt_to_equity = data.debt_to_equity
    if m.debt_to_equity is None and data.total_debt and data.total_equity and data.total_equity > 0:
        m.debt_to_equity = data.total_debt / data.total_equity
    m.equity_negative = data.total_equity is not None and data.total_equity < 0
    m.debt_to_assets = data.debt_to_assets or _safe_div(data.total_debt, data.total_assets)
    m.debt_to_ebitda = _safe_div(data.total_debt, data.ebitda) if data.ebitda and data.ebitda > 0 else None

    # Profitability
    m.operating_margin = data.operating_margin or _safe_div(data.operating_income, data.revenue)
    m.net_margin = data.net_margin or _safe_div(data.net_income, data.revenue)
    m.operating_margin_trend = _trend(data.operating_income, data.operating_income_prior)
    m.net_income_trend = _trend(data.net_income, data.net_income_prior)

    # Cash flow
    m.ocf_positive = data.operating_cashflow is not None and data.operating_cashflow > 0
    m.fcf_positive = data.free_cashflow is not None and data.free_cashflow > 0
    m.ocf_trend = _trend(data.operating_cashflow, data.operating_cashflow_prior)
    m.fcf_trend = _trend(data.free_cashflow, data.free_cashflow_prior)

    # Cash burn estimate (months)
    if data.free_cashflow is not None and data.free_cashflow < 0 and data.cash_and_equivalents:
        monthly_burn = abs(data.free_cashflow) / 12
        m.cash_burn_months = data.cash_and_equivalents / monthly_burn if monthly_burn > 0 else None

    # Interest coverage
    m.interest_coverage = data.interest_coverage
    if m.interest_coverage is None and data.ebitda is not None and data.interest_expense:
        m.interest_coverage = data.ebitda / data.interest_expense if data.interest_expense > 0 else None

    # Dilution
    if data.shares_outstanding and data.shares_outstanding_prior:
        m.shares_change_pct = (data.shares_outstanding - data.shares_outstanding_prior) / data.shares_outstanding_prior
        if m.shares_change_pct > 0.20:
            m.dilution_risk = "high"
        elif m.shares_change_pct > 0.05:
            m.dilution_risk = "moderate"
        else:
            m.dilution_risk = "low"

    # Altman Z-Score (simplified for public companies)
    if all(v is not None for v in [data.working_capital, data.total_assets, data.retained_earnings,
                                    data.operating_income, data.market_cap, data.total_liabilities, data.revenue]):
        wc_ta = data.working_capital / data.total_assets  # type: ignore[operator]
        re_ta = data.retained_earnings / data.total_assets  # type: ignore[operator]
        ebit_ta = data.operating_income / data.total_assets  # type: ignore[operator]
        mc_tl = data.market_cap / data.total_liabilities if data.total_liabilities > 0 else 0  # type: ignore[operator]
        rev_ta = data.revenue / data.total_assets  # type: ignore[operator]
        m.altman_z = 1.2 * wc_ta + 1.4 * re_ta + 3.3 * ebit_ta + 0.6 * mc_tl + 1.0 * rev_ta

    # Revenue trend
    m.revenue_trend = _trend(data.revenue, data.revenue_prior)

    return m


def _score_component(value: float | None, thresholds: list[tuple[float, float]], default: float = 50.0) -> float:
    """Score a single metric. Thresholds are (boundary, score) pairs sorted by boundary ascending."""
    if value is None:
        return default
    for boundary, score in thresholds:
        if value <= boundary:
            return score
    return thresholds[-1][1] if thresholds else default


def compute_score(m: DistressMetrics) -> float:
    """Compute composite distress score (0-100, higher = more risk)."""
    components: list[tuple[float, float]] = []  # (score, weight)

    # Liquidity (weight 15)
    if m.current_ratio is not None:
        liq = _score_component(m.current_ratio, [(0.5, 90), (0.8, 70), (1.0, 50), (1.5, 25), (2.0, 10)])
        components.append((liq, 15))
    if m.cash_to_debt is not None:
        ctd = _score_component(m.cash_to_debt, [(0.05, 85), (0.1, 65), (0.2, 45), (0.5, 20), (1.0, 5)])
        components.append((ctd, 5))

    # Leverage (weight 20)
    if m.equity_negative:
        components.append((95, 10))
    elif m.debt_to_equity is not None:
        dte = _score_component(m.debt_to_equity, [(0.5, 10), (1.0, 25), (2.0, 45), (4.0, 70), (8.0, 90)])
        components.append((dte, 10))
    if m.debt_to_assets is not None:
        dta = _score_component(m.debt_to_assets, [(0.2, 10), (0.4, 30), (0.6, 55), (0.8, 80), (1.0, 95)])
        components.append((dta, 10))

    # Profitability (weight 15)
    if m.operating_margin is not None:
        opm = _score_component(m.operating_margin, [(-0.15, 90), (-0.05, 75), (0.0, 60), (0.05, 40), (0.15, 15)])
        components.append((opm, 10))
    if m.net_margin is not None:
        nm = _score_component(m.net_margin, [(-0.20, 85), (-0.05, 70), (0.0, 55), (0.05, 30), (0.10, 10)])
        components.append((nm, 5))

    # Cash flow (weight 20)
    if m.ocf_positive is not None:
        cf_score = 15 if m.ocf_positive else 80
        components.append((cf_score, 10))
    if m.fcf_positive is not None:
        fcf_score = 15 if m.fcf_positive else 70
        components.append((fcf_score, 10))

    # Interest coverage (weight 15)
    if m.interest_coverage is not None:
        ic = _score_component(m.interest_coverage, [(0.5, 95), (1.0, 80), (2.0, 55), (4.0, 30), (8.0, 10)])
        components.append((ic, 15))

    # Altman Z (weight 10)
    if m.altman_z is not None:
        az = _score_component(m.altman_z, [(1.1, 90), (1.8, 70), (2.7, 40), (3.0, 20), (4.0, 5)])
        components.append((az, 10))

    # Dilution (weight 5)
    if m.dilution_risk == "high":
        components.append((80, 5))
    elif m.dilution_risk == "moderate":
        components.append((45, 5))
    elif m.dilution_risk == "low":
        components.append((10, 5))

    if not components:
        return 50.0

    total_weight = sum(w for _, w in components)
    weighted_sum = sum(s * w for s, w in components)
    return round(weighted_sum / total_weight, 1) if total_weight > 0 else 50.0


def rating_from_score(score: float) -> str:
    if score <= 25:
        return "Low"
    if score <= 50:
        return "Moderate"
    if score <= 75:
        return "High"
    return "Severe"


def generate_assessment(data: FinancialData) -> DistressAssessment:
    """Generate a complete distress assessment from financial data."""
    metrics = compute_metrics(data)
    score = compute_score(metrics)
    rating = rating_from_score(score)

    risks: list[str] = []
    strengths: list[str] = []
    watch: list[str] = []

    # Build risk / strength lists
    if metrics.equity_negative:
        risks.append("Negative shareholder equity — liabilities exceed assets")
    if metrics.current_ratio is not None and metrics.current_ratio < 1.0:
        risks.append(f"Current ratio of {_fmt(metrics.current_ratio)} indicates near-term liquidity pressure")
    if metrics.interest_coverage is not None and metrics.interest_coverage < 2.0:
        risks.append(f"Interest coverage of {_fmt(metrics.interest_coverage)}x is dangerously thin")
    if metrics.operating_margin is not None and metrics.operating_margin < 0:
        risks.append("Operating at a loss — core business is not generating profit")
    if metrics.ocf_positive is False:
        risks.append("Operating cash flow is negative — the business is consuming cash")
    if metrics.fcf_positive is False and metrics.ocf_positive is not False:
        risks.append("Free cash flow is negative after capital expenditures")
    if metrics.debt_to_ebitda is not None and metrics.debt_to_ebitda > 6:
        risks.append(f"Debt/EBITDA of {_fmt(metrics.debt_to_ebitda)}x implies heavy leverage burden")
    elif metrics.debt_to_equity is not None and metrics.debt_to_equity > 3:
        risks.append(f"Debt-to-equity of {_fmt(metrics.debt_to_equity)}x reflects elevated leverage")
    if metrics.operating_margin_trend == "deteriorating":
        risks.append("Operating margins are deteriorating relative to prior period")
    if metrics.fcf_trend == "deteriorating":
        risks.append("Free cash flow is declining, suggesting worsening cash generation")
    if metrics.dilution_risk == "high":
        risks.append(f"Share count increased {_fmt(metrics.shares_change_pct, pct=True)} — significant dilution")
    if metrics.cash_burn_months is not None and metrics.cash_burn_months < 18:
        risks.append(f"At current burn rate, cash runway is approximately {metrics.cash_burn_months:.0f} months")
    if metrics.altman_z is not None and metrics.altman_z < 1.8:
        risks.append(f"Altman Z-Score of {_fmt(metrics.altman_z)} is in the distress zone")
    if metrics.net_income_trend == "deteriorating":
        risks.append("Net income is declining relative to prior period")

    if metrics.current_ratio is not None and metrics.current_ratio > 1.5:
        strengths.append(f"Current ratio of {_fmt(metrics.current_ratio)} provides reasonable near-term liquidity")
    if metrics.ocf_positive is True:
        strengths.append("Operating cash flow is positive — core business generates cash")
    if metrics.interest_coverage is not None and metrics.interest_coverage > 5:
        strengths.append(f"Interest coverage of {_fmt(metrics.interest_coverage)}x is comfortable")
    if metrics.operating_margin is not None and metrics.operating_margin > 0.15:
        strengths.append(f"Operating margin of {_fmt(metrics.operating_margin, pct=True)} reflects solid profitability")
    if metrics.altman_z is not None and metrics.altman_z > 3.0:
        strengths.append(f"Altman Z-Score of {_fmt(metrics.altman_z)} indicates low distress probability")
    if metrics.revenue_trend == "improving":
        strengths.append("Revenue is growing relative to prior period")
    if data.cash_and_equivalents and data.total_debt and data.cash_and_equivalents > data.total_debt * 0.5:
        strengths.append(f"Cash position of {_fmt_big(data.cash_and_equivalents)} provides meaningful buffer against debt obligations")
    if metrics.dilution_risk == "low" and data.shares_outstanding_prior:
        strengths.append("No significant share dilution observed")
    if metrics.fcf_positive is True:
        strengths.append("Free cash flow is positive, supporting debt service and reinvestment")

    # What to watch
    watch.append("Next quarterly earnings release and management guidance")
    if metrics.interest_coverage is not None and metrics.interest_coverage < 4:
        watch.append("Debt maturity schedule and refinancing conditions")
    if metrics.dilution_risk in ("moderate", "high"):
        watch.append("Potential equity issuance or secondary offerings")
    if metrics.operating_margin_trend == "deteriorating":
        watch.append("Margin recovery vs. further compression in coming quarters")
    if metrics.fcf_positive is False:
        watch.append("Cash burn trajectory and liquidity runway")
    if data.total_debt and data.total_debt > 0:
        watch.append("Credit rating changes and covenant compliance")
    watch.append("Sector-wide macro headwinds or tailwinds")

    # Build "why it may be okay" list
    why_safe: list[str] = []
    if metrics.ocf_positive is True:
        why_safe.append("The business generates positive operating cash flow")
    if metrics.current_ratio is not None and metrics.current_ratio >= 1.0:
        why_safe.append("Near-term liquidity appears adequate based on current assets vs. current liabilities")
    if metrics.interest_coverage is not None and metrics.interest_coverage >= 2.0:
        why_safe.append("Interest coverage is sufficient to service existing debt obligations")
    if data.revenue and data.revenue > 0:
        why_safe.append("Revenue base remains intact and the business continues to generate top-line income")
    if metrics.altman_z is not None and metrics.altman_z > 1.81:
        why_safe.append("Altman Z-Score does not place the company in the acute distress zone")
    if not why_safe:
        why_safe.append("Limited positive financial signals were identified in the current snapshot")

    # Generate narrative sections
    liq_text = _build_liquidity_narrative(data, metrics)
    lev_text = _build_leverage_narrative(data, metrics)
    prof_text = _build_profitability_narrative(data, metrics)
    cf_text = _build_cashflow_narrative(data, metrics)
    ic_text = _build_interest_coverage_narrative(data, metrics)
    dil_text = _build_dilution_narrative(data, metrics)
    lt_text = _build_long_term_trend_narrative(data, metrics)

    # Executive summary
    summary = _build_executive_summary(data, metrics, rating, score, risks, strengths)

    # Hold context
    hold_text = _build_hold_context(data, metrics, rating, score)

    # Analyst notes
    notes = _build_analyst_notes(data, metrics, rating)

    raw = {}
    for k, v in metrics.__dict__.items():
        if v is not None:
            raw[k] = v

    return DistressAssessment(
        ticker=data.ticker,
        company_name=data.company_name,
        sector=data.sector,
        industry=data.industry,
        period_end=data.period_end,
        distress_rating=rating,
        distress_score=score,
        executive_summary=summary,
        why_safe=why_safe,
        key_risks=risks,
        stabilizing_factors=strengths,
        what_to_watch=watch,
        liquidity_analysis=liq_text,
        leverage_analysis=lev_text,
        profitability_analysis=prof_text,
        cashflow_analysis=cf_text,
        interest_coverage_analysis=ic_text,
        dilution_risk_analysis=dil_text,
        long_term_trend_analysis=lt_text,
        hold_context=hold_text,
        analyst_notes=notes,
        metrics=metrics,
        raw_metrics=raw,
    )


# ── Narrative builders ───────────────────────────────────────────────────


def _build_executive_summary(data: FinancialData, m: DistressMetrics, rating: str, score: float,
                             risks: list[str], strengths: list[str]) -> str:
    risk_word = {
        "Low": "financially healthy",
        "Moderate": "showing some financial stress indicators",
        "High": "exhibiting meaningful financial distress signals",
        "Severe": "facing severe financial distress",
    }[rating]

    opening = f"{data.company_name} ({data.ticker}) appears {risk_word} based on our multi-factor analysis."

    if rating in ("High", "Severe"):
        body = (
            f" The company's distress score of {score:.0f}/100 reflects "
            f"concerns across {'negative equity, ' if m.equity_negative else ''}"
            f"{'weak interest coverage, ' if m.interest_coverage and m.interest_coverage < 2 else ''}"
            f"{'declining profitability, ' if m.operating_margin_trend == 'deteriorating' else ''}"
            f"and overall balance sheet stress. "
            f"While immediate default is not certain, the current profile suggests elevated "
            f"risk of financial restructuring, dilution, or further deterioration if conditions do not improve."
        )
    elif rating == "Moderate":
        body = (
            f" With a distress score of {score:.0f}/100, the company shows mixed signals — "
            f"some strengths offset by areas of concern. "
            f"Close monitoring of leverage, cash flow trends, and margin stability is warranted."
        )
    else:
        body = (
            f" With a distress score of {score:.0f}/100, the company demonstrates "
            f"solid fundamentals across key solvency, liquidity, and profitability indicators. "
            f"No immediate distress signals are apparent in the current snapshot."
        )

    return opening + body


def _build_liquidity_narrative(data: FinancialData, m: DistressMetrics) -> str:
    parts = []
    if m.current_ratio is not None:
        quality = "strong" if m.current_ratio > 1.5 else "adequate" if m.current_ratio > 1.0 else "weak"
        parts.append(f"The current ratio stands at {_fmt(m.current_ratio)}, indicating {quality} near-term liquidity.")
    if data.cash_and_equivalents is not None:
        parts.append(f"Cash and equivalents total {_fmt_big(data.cash_and_equivalents)}.")
    if m.cash_burn_months is not None:
        parts.append(f"At the current free cash flow burn rate, the cash runway is approximately {m.cash_burn_months:.0f} months.")
    if data.working_capital is not None:
        sign = "positive" if data.working_capital > 0 else "negative"
        parts.append(f"Working capital is {sign} at {_fmt_big(data.working_capital)}.")
    return " ".join(parts) if parts else "Insufficient data to assess liquidity in detail."


def _build_leverage_narrative(data: FinancialData, m: DistressMetrics) -> str:
    parts = []
    if m.equity_negative:
        parts.append("The company has negative shareholder equity, meaning total liabilities exceed total assets. This is a serious red flag for solvency.")
    if data.total_debt is not None:
        parts.append(f"Total debt stands at {_fmt_big(data.total_debt)}.")
    if m.debt_to_equity is not None and not m.equity_negative:
        severity = "conservative" if m.debt_to_equity < 1 else "moderate" if m.debt_to_equity < 2 else "elevated" if m.debt_to_equity < 4 else "severe"
        parts.append(f"Debt-to-equity of {_fmt(m.debt_to_equity)}x represents {severity} leverage.")
    if m.debt_to_ebitda is not None:
        severity = "manageable" if m.debt_to_ebitda < 3 else "elevated" if m.debt_to_ebitda < 6 else "concerning"
        parts.append(f"Debt/EBITDA of {_fmt(m.debt_to_ebitda)}x is {severity}.")
    return " ".join(parts) if parts else "Insufficient data to assess leverage in detail."


def _build_profitability_narrative(data: FinancialData, m: DistressMetrics) -> str:
    parts = []
    if m.operating_margin is not None:
        if m.operating_margin < 0:
            parts.append(f"The company is operating at a loss with an operating margin of {_fmt(m.operating_margin, pct=True)}.")
        else:
            parts.append(f"Operating margin is {_fmt(m.operating_margin, pct=True)}.")
    if m.net_margin is not None:
        parts.append(f"Net margin is {_fmt(m.net_margin, pct=True)}.")
    if m.operating_margin_trend:
        parts.append(f"Operating profitability is {m.operating_margin_trend} relative to the prior period.")
    if data.revenue is not None:
        parts.append(f"Revenue for the period was {_fmt_big(data.revenue)}.")
    if m.revenue_trend:
        parts.append(f"Revenue trend is {m.revenue_trend}.")
    return " ".join(parts) if parts else "Insufficient data to assess profitability in detail."


def _build_cashflow_narrative(data: FinancialData, m: DistressMetrics) -> str:
    parts = []
    if data.operating_cashflow is not None:
        sign = "positive" if data.operating_cashflow > 0 else "negative"
        parts.append(f"Operating cash flow is {sign} at {_fmt_big(data.operating_cashflow)}.")
    if data.free_cashflow is not None:
        sign = "positive" if data.free_cashflow > 0 else "negative"
        parts.append(f"Free cash flow is {sign} at {_fmt_big(data.free_cashflow)}.")
    if m.ocf_trend:
        parts.append(f"Operating cash flow trend is {m.ocf_trend}.")
    if m.fcf_trend:
        parts.append(f"Free cash flow trend is {m.fcf_trend}.")
    return " ".join(parts) if parts else "Insufficient data to assess cash flow in detail."


def _build_interest_coverage_narrative(data: FinancialData, m: DistressMetrics) -> str:
    if m.interest_coverage is None:
        return "Interest expense data not available for coverage analysis."
    quality = "comfortable" if m.interest_coverage > 5 else "adequate" if m.interest_coverage > 2 else "thin" if m.interest_coverage > 1 else "critically weak"
    text = f"Interest coverage ratio is {_fmt(m.interest_coverage)}x, which is {quality}."
    if m.interest_coverage < 2 and data.interest_expense:
        text += f" Annual interest expense of {_fmt_big(data.interest_expense)} places significant pressure on earnings."
    return text


def _build_dilution_narrative(data: FinancialData, m: DistressMetrics) -> str:
    if m.shares_change_pct is None:
        return "Share count comparison data not available."
    if m.dilution_risk == "high":
        return (
            f"Shares outstanding increased {_fmt(m.shares_change_pct, pct=True)} over the period, "
            f"representing significant equity dilution. This often signals capital raising under pressure "
            f"and further dilution risk going forward."
        )
    if m.dilution_risk == "moderate":
        return (
            f"Shares outstanding increased {_fmt(m.shares_change_pct, pct=True)}, indicating moderate dilution. "
            f"Monitor for additional equity issuance."
        )
    return (
        f"Share count change of {_fmt(m.shares_change_pct, pct=True)} is minimal, "
        f"suggesting no material dilution pressure."
    )


def _build_long_term_trend_narrative(data: FinancialData, m: DistressMetrics) -> str:
    parts = []
    trends_positive = 0
    trends_negative = 0
    if m.revenue_trend == "improving":
        trends_positive += 1
    elif m.revenue_trend == "deteriorating":
        trends_negative += 1
    if m.operating_margin_trend == "improving":
        trends_positive += 1
    elif m.operating_margin_trend == "deteriorating":
        trends_negative += 1
    if m.ocf_trend == "improving":
        trends_positive += 1
    elif m.ocf_trend == "deteriorating":
        trends_negative += 1
    if m.fcf_trend == "improving":
        trends_positive += 1
    elif m.fcf_trend == "deteriorating":
        trends_negative += 1

    if trends_negative > trends_positive and trends_negative >= 2:
        parts.append(
            "Multiple financial trends are deteriorating simultaneously, including "
            "cash flow, profitability, or revenue. This pattern, if sustained, "
            "increases the probability of future financial stress."
        )
    elif trends_positive > trends_negative and trends_positive >= 2:
        parts.append(
            "Several key financial metrics are trending favorably, suggesting "
            "the company may be on an improving trajectory. Continued improvement "
            "would reduce long-term distress risk."
        )
    else:
        parts.append(
            "Financial trends are mixed, with some metrics improving and others stable or weakening. "
            "No clear directional pattern is evident from the available comparison periods."
        )

    if data.total_debt and data.total_debt > 0:
        parts.append(f"Total debt of {_fmt_big(data.total_debt)} will require ongoing servicing and eventual refinancing.")
        if data.long_term_debt and data.short_term_debt:
            lt_pct = data.long_term_debt / data.total_debt * 100
            parts.append(f"Of total debt, {lt_pct:.0f}% is long-term and {100 - lt_pct:.0f}% is short-term or current.")
        if m.interest_coverage is not None and m.interest_coverage < 3:
            parts.append("With thin interest coverage, refinancing at favorable terms may be difficult.")
    return " ".join(parts) if parts else "Insufficient data to assess long-term trends."


def _build_hold_context(data: FinancialData, m: DistressMetrics, rating: str, score: float) -> str:
    if rating == "Low":
        return (
            f"Based on currently available fundamentals, {data.company_name} does not appear to face "
            f"near-term financial distress risk. The balance sheet, cash flow profile, and profitability "
            f"indicators are consistent with financial stability. As always, ongoing monitoring of future "
            f"filings and market developments is prudent."
        )
    if rating == "Moderate":
        return (
            f"The current fundamentals suggest {data.company_name} is financially viable but shows "
            f"some areas of concern. The company does not appear to face imminent distress based on "
            f"available data, but holders should monitor leverage trends, cash flow sustainability, "
            f"and profitability in upcoming quarters for signs of improvement or deterioration."
        )
    if rating == "High":
        return (
            f"The financial profile of {data.company_name} currently shows elevated risk indicators. "
            f"While immediate collapse is not certain based on available data, the combination of "
            f"balance sheet stress and operational weakness warrants close attention. Holders should "
            f"carefully monitor debt servicing ability, liquidity, and management actions in upcoming filings."
        )
    return (
        f"{data.company_name} shows severe financial stress indicators across multiple dimensions. "
        f"The current profile suggests meaningful risk of restructuring, dilution, or further deterioration. "
        f"This does not guarantee bankruptcy, but the available fundamentals indicate a company under "
        f"significant financial pressure. Close monitoring of every subsequent filing is strongly recommended."
    )


def _build_analyst_notes(data: FinancialData, m: DistressMetrics, rating: str) -> str:
    notes = []
    if data.period_end:
        notes.append(f"Analysis based on financial data as of {data.period_end}.")
    notes.append(f"This assessment is informational and does not constitute investment advice.")
    notes.append(
        "The distress score is a composite of liquidity, leverage, profitability, "
        "cash flow, interest coverage, and solvency indicators weighted by relevance."
    )
    if m.altman_z is not None:
        zone = "safe zone" if m.altman_z > 2.99 else "grey zone" if m.altman_z > 1.81 else "distress zone"
        notes.append(f"The Altman Z-Score of {_fmt(m.altman_z)} places this company in the {zone}.")
    return " ".join(notes)
