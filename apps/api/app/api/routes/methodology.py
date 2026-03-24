"""Methodology endpoint — explains the distress scoring framework."""

from fastapi import APIRouter

from app.schemas.report import MethodologyFactor, MethodologyResponse

router = APIRouter()

METHODOLOGY = MethodologyResponse(
    scoring_model="SimuAlpha Composite Distress Score v1",
    factors=[
        MethodologyFactor(
            name="Liquidity",
            weight="~20%",
            description="Measures near-term ability to meet obligations using current ratio, cash-to-debt ratio, and working capital position.",
            thresholds="Current ratio below 1.0 is a red flag; above 1.5 is considered healthy.",
        ),
        MethodologyFactor(
            name="Leverage",
            weight="~20%",
            description="Assesses debt burden relative to equity and assets, including debt-to-equity, debt-to-assets, and debt-to-EBITDA ratios.",
            thresholds="Negative equity is a severe warning. D/E above 4x is elevated. Debt/EBITDA above 6x is concerning.",
        ),
        MethodologyFactor(
            name="Profitability",
            weight="~15%",
            description="Evaluates operating margin, net margin, and trend direction to determine if the core business generates sustainable earnings.",
            thresholds="Negative operating margin signals operational losses. Deteriorating trend adds risk.",
        ),
        MethodologyFactor(
            name="Cash Flow",
            weight="~20%",
            description="Analyzes operating cash flow and free cash flow — whether the business generates or consumes cash, and whether the trend is improving or deteriorating.",
            thresholds="Negative OCF is a serious concern. Negative FCF with limited cash reserves implies burn risk.",
        ),
        MethodologyFactor(
            name="Interest Coverage",
            weight="~15%",
            description="Compares EBITDA to interest expense to gauge ability to service debt. This is one of the most direct indicators of near-term default risk.",
            thresholds="Below 1.0x means earnings do not cover interest. Below 2.0x is thin. Above 5.0x is comfortable.",
        ),
        MethodologyFactor(
            name="Altman Z-Score",
            weight="~10%",
            description="A well-established academic model combining working capital, retained earnings, EBIT, market cap, and revenue relative to assets.",
            thresholds="Below 1.81 indicates distress zone. 1.81-2.99 is the grey zone. Above 2.99 is safe zone.",
        ),
    ],
    disclaimers=[
        "SimuAlpha distress analysis is informational only and does not constitute investment advice.",
        "The model estimates distress probability based on publicly available financial data and should not be interpreted as a guarantee of future outcomes.",
        "Past financial performance does not predict future results. Companies can improve or deteriorate rapidly based on management actions, market conditions, and external events.",
        "Always consult qualified financial professionals before making investment decisions.",
        "Data accuracy depends on the quality and timeliness of source financial statements.",
    ],
    version="v1",
)


@router.get("/methodology", response_model=MethodologyResponse)
async def get_methodology() -> MethodologyResponse:
    """Return the distress scoring methodology."""
    return METHODOLOGY
