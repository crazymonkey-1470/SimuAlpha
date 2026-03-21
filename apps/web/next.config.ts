import type { NextConfig } from "next";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@simualpha/ui", "@simualpha/types"],

  // Proxy /api/v1/* to the backend during development.
  // In production, set NEXT_PUBLIC_API_URL to the backend's full URL
  // and the frontend will call it directly (CORS must be configured).
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
