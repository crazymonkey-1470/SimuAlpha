import type { Metadata } from "next";
import { Sidebar } from "@/components/layout/sidebar";
import { AuthProvider } from "@/lib/auth-context";
import { LayoutShell } from "@/components/layout/layout-shell";
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
        <AuthProvider>
          <Sidebar />
          <LayoutShell>{children}</LayoutShell>
        </AuthProvider>
      </body>
    </html>
  );
}
