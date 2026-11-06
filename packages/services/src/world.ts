/** World ID: issue signed rp_context (nonce persisted) and consume it once at verify time. */
import { and, eq, gte, isNull, issuedNonces } from "@trenches/db";
import { WORLD_ACTION, signRpContext, type NonceStore, type RpContext } from "@trenches/worldid";
import { services } from "./context.js";

export interface WorldConfig {
  appId: string;
  rpId: string;
  signingKeyHex: string;
  action: string;
  environment: "production" | "staging" | "sandbox";
  mock: boolean;
}

export function worldFromEnv(env: NodeJS.ProcessEnv = process.env): WorldConfig {
  const appId = env.NEXT_PUBLIC_WORLD_APP_ID?.trim();
  const rpId = env.NEXT_PUBLIC_WORLD_RP_ID?.trim();
  const signingKeyHex = env.WORLD_RP_SIGNING_KEY?.trim();
  if (!appId || !rpId || !signingKeyHex) throw new Error("NEXT_PUBLIC_WORLD_APP_ID / NEXT_PUBLIC_WORLD_RP_ID / WORLD_RP_SIGNING_KEY not set");
  return {
    appId,
    rpId,
    signingKeyHex,
    action: env.WORLD_ACTION_ID?.trim() || WORLD_ACTION,
    environment: (env.NEXT_PUBLIC_WORLD_ENVIRONMENT?.trim() as WorldConfig["environment"]) || "staging",
    mock: env.WORLD_MOCK === "true",
  };
}

/** Postgres-backed single-use nonces, so verification survives serverless cold starts and multiple workers. */
export class DbNonceStore implements NonceStore {
  async issue(ctx: RpContext, action: string, trenchId?: string): Promise<void> {
    const { db } = services();
    await db.insert(issuedNonces).values({
      nonce: ctx.nonce,
      action,
      trenchId: trenchId ?? null,
      expiresAt: new Date(ctx.expires_at * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    });
  }

  async consume(nonce: string, action: string): Promise<boolean> {
    const { db } = services();
    const now = new Date().toISOString();
    const rows = await db
      .update(issuedNonces)
      .set({ consumedAt: now })
      .where(and(eq(issuedNonces.nonce, nonce), eq(issuedNonces.action, action), isNull(issuedNonces.consumedAt), gte(issuedNonces.expiresAt, now)))
      .returning({ nonce: issuedNonces.nonce });
    return rows.length === 1;
  }
}

export const nonceStore = new DbNonceStore();

export async function issueRpContext(trenchId: string): Promise<{ rp_context: RpContext; action: string; app_id: string; environment: string; mock: boolean }> {
  const w = worldFromEnv();
  const ctx = signRpContext({ rpId: w.rpId, signingKeyHex: w.signingKeyHex, action: w.action, ttl: 300 });
  await nonceStore.issue(ctx, w.action, trenchId);
  return { rp_context: ctx, action: w.action, app_id: w.appId, environment: w.environment, mock: w.mock };
}
