import type { Metadata } from "next";
import { Sidebar } from "@/components/layout/sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "SimuAlpha",
  description: "Quantitative market intelligence and simulation platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans">
        <Sidebar />
        <main className="ml-56 min-h-screen">{children}</main>
      </body>
    </html>
  );
}
