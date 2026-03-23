"use client";

import { usePathname } from "next/navigation";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage =
    pathname.startsWith("/login") || pathname.startsWith("/register");

  return (
    <main className={`min-h-screen ${isAuthPage ? "" : "lg:ml-56"}`}>
      {children}
    </main>
  );
}
