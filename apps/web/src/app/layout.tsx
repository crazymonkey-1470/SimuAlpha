import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SimuAlpha — Financial Distress Risk Intelligence",
  description:
    "Analyze the financial strength of any public company. SimuAlpha reviews debt, liquidity, cash flow, and long-term fundamentals to identify distress risk.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans bg-surface-0 text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
