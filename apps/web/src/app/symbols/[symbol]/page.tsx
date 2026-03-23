import SymbolDetailClient from "./symbol-detail-client";

export function generateStaticParams() {
  // Pre-generate common symbols; others handled at runtime via client-side navigation
  return [
    { symbol: "SPY" },
    { symbol: "QQQ" },
    { symbol: "AAPL" },
    { symbol: "MSFT" },
    { symbol: "AMZN" },
    { symbol: "GOOGL" },
    { symbol: "TSLA" },
    { symbol: "NVDA" },
    { symbol: "META" },
    { symbol: "IWM" },
  ];
}

export default function SymbolDetailPage() {
  return <SymbolDetailClient />;
}
