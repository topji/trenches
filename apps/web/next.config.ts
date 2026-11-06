import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@trenches/core", "@trenches/services", "@trenches/arkiv", "@trenches/hedera", "@trenches/db", "@trenches/worldid"],
  serverExternalPackages: ["@hiero-ledger/sdk", "@grpc/grpc-js", "postgres", "pino", "@privy-io/node"],
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages use ESM-style ".js" specifiers for ".ts" sources; webpack needs the alias.
  webpack: (config) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"], ".mjs": [".mts", ".mjs"] };
    // Privy's optional Solana peers are never used (ethereum-only); keep webpack from bundling them (docs/integrations/privy.md §5).
    config.externals.push({
      "@solana/kit": "commonjs @solana/kit",
      "@solana-program/system": "commonjs @solana-program/system",
      "@solana-program/token": "commonjs @solana-program/token",
      "@solana-program/memo": "commonjs @solana-program/memo",
    });
    return config;
  },
};

export default nextConfig;
