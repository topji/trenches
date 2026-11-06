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

// Cached on globalThis so Next.js hot reloads reuse one Hedera client / Postgres pool instead of
// leaking a new set of gRPC channels and connections on every module re-evaluation.
const g = globalThis as unknown as { __trenchesServices?: Services | null };

export function services(): Services {
  if (g.__trenchesServices) return g.__trenchesServices;
  const config = configFromEnv();
  const { pub, wallet } = arkivFromEnv();
  if (!wallet) throw new Error("ARKIV_WRITER_KEY is not set");
  const hedera = hederaFromEnv();
  if (!hedera) throw new Error("HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY not set");
  g.__trenchesServices = {
    db: dbFromEnv(),
    arkiv: new ArkivRepo(pub, wallet.client, wallet.address),
    hedera,
    mirror: new MirrorNode(config.network),
    hs: hashscan(config.network),
    config,
  };
  return g.__trenchesServices;
}

/** Read-only Arkiv access for public pages (no writer needed, no Hedera). */
export function arkivReader(): ArkivRepo {
  if (g.__trenchesServices) return g.__trenchesServices.arkiv;
  const { pub, wallet } = arkivFromEnv();
  return new ArkivRepo(pub, wallet?.client ?? null, wallet?.address ?? null);
}
