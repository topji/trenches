import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@trenches/core", "@trenches/services", "@trenches/arkiv", "@trenches/hedera", "@trenches/db"],
  serverExternalPackages: ["@hiero-ledger/sdk", "postgres", "pino"],
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
