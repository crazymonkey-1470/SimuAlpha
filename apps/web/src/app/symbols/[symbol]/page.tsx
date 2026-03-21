import SymbolDetailClient from "./symbol-detail-client";

export const dynamicParams = false;

export async function generateStaticParams() {
  return [{ symbol: "SPY" }];
}

export default function SymbolDetailPage() {
  return <SymbolDetailClient />;
}
