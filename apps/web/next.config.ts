import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  transpilePackages: ["@simualpha/ui", "@simualpha/types"],
  images: { unoptimized: true },
};

export default nextConfig;
