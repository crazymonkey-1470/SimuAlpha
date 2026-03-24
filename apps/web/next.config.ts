import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@simualpha/ui", "@simualpha/types"],
  images: { unoptimized: true },
};

export default nextConfig;
