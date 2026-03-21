import type { NextConfig } from "next";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  transpilePackages: ["@simualpha/ui", "@simualpha/types"],

  // Proxy /api/v1/* to the backend so the browser never hits CORS issues.
  // In production on Cloudflare you may replace this with a Cloudflare Worker
  // or configure CORS on the FastAPI backend directly.
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
