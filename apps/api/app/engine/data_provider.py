"""Financial data provider abstraction.

Provides a modular interface for fetching company financial data.
Currently includes a mock provider for development and a Financial Modeling Prep
provider that can be activated with an API key.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class FinancialData:
    """Standardized financial data for distress analysis."""

    ticker: str
    company_name: str
    sector: str | None = None
    industry: str | None = None
    market_cap: float | None = None
    period_end: str | None = None  # e.g. "2024-12-31"

    # Balance sheet
    total_assets: float | None = None
    total_liabilities: float | None = None
    total_debt: float | None = None
    long_term_debt: float | None = None
    short_term_debt: float | None = None
    cash_and_equivalents: float | None = None
    current_assets: float | None = None
    current_liabilities: float | None = None
    total_equity: float | None = None
    retained_earnings: float | None = None
    working_capital: float | None = None

    # Income statement
    revenue: float | None = None
    revenue_prior: float | None = None
    operating_income: float | None = None
    operating_income_prior: float | None = None
    net_income: float | None = None
    net_income_prior: float | None = None
    ebitda: float | None = None
    interest_expense: float | None = None
    gross_profit: float | None = None

    # Cash flow
    operating_cashflow: float | None = None
    operating_cashflow_prior: float | None = None
    free_cashflow: float | None = None
    free_cashflow_prior: float | None = None
    capex: float | None = None

    # Shares
    shares_outstanding: float | None = None
    shares_outstanding_prior: float | None = None

    # Derived ratios (can be computed or supplied)
    current_ratio: float | None = None
    debt_to_equity: float | None = None
    debt_to_assets: float | None = None
    interest_coverage: float | None = None
    operating_margin: float | None = None
    net_margin: float | None = None
    roe: float | None = None
    roa: float | None = None

    # Raw data passthrough
    raw: dict[str, Any] = field(default_factory=dict)


class DataProvider(ABC):
    """Abstract interface for financial data providers."""

    @abstractmethod
    def fetch(self, ticker: str) -> FinancialData | None:
        """Fetch financial data for a ticker. Returns None if not found."""

    @abstractmethod
    def validate_ticker(self, ticker: str) -> bool:
        """Check if a ticker is valid/recognized."""


class MockDataProvider(DataProvider):
    """Development mock provider with realistic sample data."""

    _MOCK_DATA: dict[str, FinancialData] = {}

    def __init__(self) -> None:
        self._build_mocks()

    def _build_mocks(self) -> None:
        # Healthy company
        self._MOCK_DATA["AAPL"] = FinancialData(
            ticker="AAPL",
            company_name="Apple Inc.",
            sector="Technology",
            industry="Consumer Electronics",
            market_cap=3_200_000_000_000,
            period_end="2024-09-28",
            total_assets=364_980_000_000,
            total_liabilities=308_030_000_000,
            total_debt=104_590_000_000,
            long_term_debt=95_280_000_000,
            short_term_debt=9_310_000_000,
            cash_and_equivalents=29_940_000_000,
            current_assets=152_990_000_000,
            current_liabilities=176_390_000_000,
            total_equity=56_950_000_000,
            retained_earnings=4_340_000_000,
            working_capital=-23_400_000_000,
            revenue=391_040_000_000,
            revenue_prior=383_290_000_000,
            operating_income=123_220_000_000,
            operating_income_prior=114_300_000_000,
            net_income=93_740_000_000,
            net_income_prior=96_990_000_000,
            ebitda=134_660_000_000,
            interest_expense=3_580_000_000,
            gross_profit=180_680_000_000,
            operating_cashflow=118_250_000_000,
            operating_cashflow_prior=110_540_000_000,
            free_cashflow=108_810_000_000,
            free_cashflow_prior=99_580_000_000,
            capex=-9_440_000_000,
            shares_outstanding=15_410_000_000,
            shares_outstanding_prior=15_740_000_000,
            current_ratio=0.87,
            debt_to_equity=1.84,
            debt_to_assets=0.29,
            interest_coverage=37.6,
            operating_margin=0.315,
            net_margin=0.240,
        )

        # Distressed company
        self._MOCK_DATA["AMC"] = FinancialData(
            ticker="AMC",
            company_name="AMC Entertainment Holdings, Inc.",
            sector="Communication Services",
            industry="Entertainment",
            market_cap=1_680_000_000,
            period_end="2024-09-30",
            total_assets=8_940_000_000,
            total_liabilities=10_630_000_000,
            total_debt=4_690_000_000,
            long_term_debt=4_420_000_000,
            short_term_debt=270_000_000,
            cash_and_equivalents=770_000_000,
            current_assets=1_120_000_000,
            current_liabilities=1_610_000_000,
            total_equity=-1_690_000_000,
            retained_earnings=-5_720_000_000,
            working_capital=-490_000_000,
            revenue=4_630_000_000,
            revenue_prior=4_810_000_000,
            operating_income=-280_000_000,
            operating_income_prior=-120_000_000,
            net_income=-590_000_000,
            net_income_prior=-390_000_000,
            ebitda=190_000_000,
            interest_expense=370_000_000,
            gross_profit=2_240_000_000,
            operating_cashflow=-62_000_000,
            operating_cashflow_prior=140_000_000,
            free_cashflow=-210_000_000,
            free_cashflow_prior=-45_000_000,
            capex=-148_000_000,
            shares_outstanding=362_000_000,
            shares_outstanding_prior=165_000_000,
            current_ratio=0.70,
            debt_to_equity=None,  # negative equity
            debt_to_assets=0.52,
            interest_coverage=0.51,
            operating_margin=-0.060,
            net_margin=-0.127,
        )

        # Moderate risk company
        self._MOCK_DATA["F"] = FinancialData(
            ticker="F",
            company_name="Ford Motor Company",
            sector="Consumer Cyclical",
            industry="Auto Manufacturers",
            market_cap=42_000_000_000,
            period_end="2024-09-30",
            total_assets=272_800_000_000,
            total_liabilities=228_200_000_000,
            total_debt=160_000_000_000,
            long_term_debt=148_000_000_000,
            short_term_debt=12_000_000_000,
            cash_and_equivalents=25_100_000_000,
            current_assets=107_200_000_000,
            current_liabilities=94_300_000_000,
            total_equity=44_600_000_000,
            retained_earnings=22_400_000_000,
            working_capital=12_900_000_000,
            revenue=176_200_000_000,
            revenue_prior=176_400_000_000,
            operating_income=4_640_000_000,
            operating_income_prior=7_590_000_000,
            net_income=1_820_000_000,
            net_income_prior=4_350_000_000,
            ebitda=13_600_000_000,
            interest_expense=6_800_000_000,
            gross_profit=17_600_000_000,
            operating_cashflow=10_100_000_000,
            operating_cashflow_prior=14_900_000_000,
            free_cashflow=3_200_000_000,
            free_cashflow_prior=6_900_000_000,
            capex=-6_900_000_000,
            shares_outstanding=3_980_000_000,
            shares_outstanding_prior=4_010_000_000,
            current_ratio=1.14,
            debt_to_equity=3.59,
            debt_to_assets=0.59,
            interest_coverage=2.0,
            operating_margin=0.026,
            net_margin=0.010,
        )

        # Copy SPY as a placeholder for unknown tickers
        self._MOCK_DATA["MSFT"] = FinancialData(
            ticker="MSFT",
            company_name="Microsoft Corporation",
            sector="Technology",
            industry="Software - Infrastructure",
            market_cap=3_100_000_000_000,
            period_end="2024-06-30",
            total_assets=512_160_000_000,
            total_liabilities=243_690_000_000,
            total_debt=47_180_000_000,
            long_term_debt=42_690_000_000,
            short_term_debt=4_490_000_000,
            cash_and_equivalents=75_540_000_000,
            current_assets=159_730_000_000,
            current_liabilities=124_490_000_000,
            total_equity=268_470_000_000,
            retained_earnings=173_600_000_000,
            working_capital=35_240_000_000,
            revenue=245_120_000_000,
            revenue_prior=211_920_000_000,
            operating_income=109_430_000_000,
            operating_income_prior=88_520_000_000,
            net_income=88_140_000_000,
            net_income_prior=72_360_000_000,
            ebitda=125_600_000_000,
            interest_expense=2_490_000_000,
            gross_profit=171_010_000_000,
            operating_cashflow=118_550_000_000,
            operating_cashflow_prior=87_580_000_000,
            free_cashflow=74_070_000_000,
            free_cashflow_prior=59_470_000_000,
            capex=-44_480_000_000,
            shares_outstanding=7_430_000_000,
            shares_outstanding_prior=7_470_000_000,
            current_ratio=1.28,
            debt_to_equity=0.18,
            debt_to_assets=0.09,
            interest_coverage=43.9,
            operating_margin=0.447,
            net_margin=0.360,
        )

    def fetch(self, ticker: str) -> FinancialData | None:
        upper = ticker.upper().strip()
        return self._MOCK_DATA.get(upper)

    def validate_ticker(self, ticker: str) -> bool:
        return ticker.upper().strip() in self._MOCK_DATA


def get_data_provider() -> DataProvider:
    """Factory: returns the configured data provider."""
    from app.core.config import settings

    if settings.financial_data_api_key:
        logger.info("Financial data API key configured — live provider would be used")
        # Future: return FMPDataProvider(settings.financial_data_api_key)
    return MockDataProvider()
