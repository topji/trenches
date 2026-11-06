import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@trenches/core", "@trenches/services", "@trenches/arkiv", "@trenches/hedera", "@trenches/db", "@trenches/worldid"],
  serverExternalPackages: ["@hiero-ledger/sdk", "@grpc/grpc-js", "postgres", "pino", "@privy-io/node"],
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages use ESM-style ".js" specifiers for ".ts" sources; webpack needs the alias.
  webpack: (config, { isServer }) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"], ".mjs": [".mts", ".mjs"] };
    if (isServer) {
      // Native/gRPC packages must load from node_modules at runtime. `serverExternalPackages` alone is
      // not enough under pnpm when a package resolves to two instances: Next then bundles it, and a
      // bundled Hedera SDK cannot open gRPC channels ("timeout exceeded", AccountId instanceof failures).
      config.externals.push({
        "@hiero-ledger/sdk": "commonjs @hiero-ledger/sdk",
        "@grpc/grpc-js": "commonjs @grpc/grpc-js",
        postgres: "commonjs postgres",
        pino: "commonjs pino",
        "@privy-io/node": "commonjs @privy-io/node",
      });
    }
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
