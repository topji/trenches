/**
 * Lazy singletons shared by the Next.js route handlers and the worker. Everything comes from env;
 * missing keys fail loudly at first use, never silently.
 */
import { ArkivRepo, arkivFromEnv } from "@trenches/arkiv";
import { dbFromEnv, type Db } from "@trenches/db";
import { MirrorNode, hashscan, hederaFromEnv, type HederaContext } from "@trenches/hedera";
import pino from "pino";

export const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

export interface AppConfig {
  demoMode: boolean;
  prizeTokenId: string;
  escrowSecret: string;
  network: "testnet" | "mainnet" | "previewnet";
  appUrl: string;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const prizeTokenId = env.HEDERA_PRIZE_TOKEN_ID?.trim();
  if (!prizeTokenId) throw new Error("HEDERA_PRIZE_TOKEN_ID is not set (run pnpm smoke:hedera once to create the demo token)");
  const escrowSecret = env.ESCROW_KEY_ENCRYPTION_SECRET;
  if (!escrowSecret) throw new Error("ESCROW_KEY_ENCRYPTION_SECRET is not set");
  return {
    demoMode: env.DEMO_MODE === "true",
    prizeTokenId,
    escrowSecret,
    network: (env.HEDERA_NETWORK as AppConfig["network"]) ?? "testnet",
    appUrl: env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  };
}

export interface Services {
  db: Db;
  arkiv: ArkivRepo;
  hedera: HederaContext;
  mirror: MirrorNode;
  hs: ReturnType<typeof hashscan>;
  config: AppConfig;
}

let cached: Services | null = null;

export function services(): Services {
  if (cached) return cached;
  const config = configFromEnv();
  const { pub, wallet } = arkivFromEnv();
  if (!wallet) throw new Error("ARKIV_WRITER_KEY is not set");
  const hedera = hederaFromEnv();
  if (!hedera) throw new Error("HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY not set");
  cached = {
    db: dbFromEnv(),
    arkiv: new ArkivRepo(pub, wallet.client, wallet.address),
    hedera,
    mirror: new MirrorNode(config.network),
    hs: hashscan(config.network),
    config,
  };
  return cached;
}

/** Read-only Arkiv access for public pages (no writer needed, no Hedera). */
export function arkivReader(): ArkivRepo {
  if (cached) return cached.arkiv;
  const { pub, wallet } = arkivFromEnv();
  return new ArkivRepo(pub, wallet?.client ?? null, wallet?.address ?? null);
}
