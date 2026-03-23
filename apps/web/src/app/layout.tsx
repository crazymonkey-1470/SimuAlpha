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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans">
        <AuthProvider>
          <Sidebar />
          <LayoutShell>{children}</LayoutShell>
        </AuthProvider>
      </body>
    </html>
  );
}
