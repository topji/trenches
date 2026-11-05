import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@trenches/core"],
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
