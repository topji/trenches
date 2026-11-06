import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@trenches/core", "@trenches/services", "@trenches/arkiv", "@trenches/hedera", "@trenches/db"],
  serverExternalPackages: ["@hiero-ledger/sdk", "@grpc/grpc-js", "postgres", "pino"],
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages use ESM-style ".js" specifiers for ".ts" sources; webpack needs the alias.
  webpack: (config) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"], ".mjs": [".mts", ".mjs"] };
    return config;
  },
};

export default nextConfig;
