/**
 * F2: one human, one slot. Verify the IDKit result server-side, store the salted nullifier hash with a
 * unique index per Trench, write the public `entry` + `profile` entities, and log it on HCS.
 */
import { canJoin, type Address, type Entry, type Profile } from "@trenches/core";
import { and, entries, eq, rowToTrench, worldVerifications } from "@trenches/db";
import { joinSignal, nullifierKey, verifyIdKitResult } from "@trenches/worldid";
import { log, services } from "./context.js";
import { ServiceError, conflict, notFound } from "./errors.js";
import { getTrenchRow, recordHcs, type HcsRecord } from "./trenches.js";
import { nonceStore, worldFromEnv } from "./world.js";

export interface JoinResult {
  entry: Omit<Entry, "worldIdNullifier">;
  mocked: boolean;
  arkiv: { entryKey: string; txHash: string } | { error: string };
  profile: { entityKey: string; txHash: string } | { error: string };
  hcs: HcsRecord | { error: string };
}

export async function joinTrench(trenchId: string, trader: Address, idkitResult: unknown): Promise<JoinResult> {
  const { db, arkiv } = services();
  const w = worldFromEnv();
  const salt = process.env.TRENCH_SALT;
  if (!salt) throw new Error("TRENCH_SALT is not set");

  const row = await getTrenchRow(trenchId);
  if (!row) throw notFound();
  const trench = rowToTrench(row);
  const gate = canJoin(trench);
  if (!gate.ok) throw new ServiceError(409, gate.reason);
  if (trench.clanId) {
    const { isClanMember } = await import("./clans.js");
    if (!(await isClanMember(trader, trench.clanId))) throw new ServiceError(403, "This is a Trench battle. Join the Trench first.");
  }

  const already = await db.select({ trader: entries.trader }).from(entries).where(and(eq(entries.trenchId, trenchId), eq(entries.trader, trader.toLowerCase()))).limit(1);
  if (already.length) throw conflict("You've already entered this battle.");

  const outcome = await verifyIdKitResult(idkitResult, {
    rpId: w.rpId,
    expectedAction: w.action,
    expectedEnvironment: w.environment,
    expectedSignal: joinSignal(trenchId, trader),
    nonces: nonceStore,
    mock: w.mock,
  });
  if (!outcome.ok) {
    log.warn({ trenchId, trader, code: outcome.code, detail: outcome.detail }, "world verification failed");
    throw new ServiceError(outcome.status === 502 ? 502 : 401, outcome.status === 502 ? outcome.detail : "Verification failed. Try again.");
  }

  const hash = nullifierKey(outcome.nullifier, salt);
  const joinedAt = new Date().toISOString();
  const entry: Entry = { trenchId, trader: trader.toLowerCase() as Address, worldIdNullifier: hash, joinedAt };

  try {
    await db.transaction(async (tx) => {
      await tx.insert(worldVerifications).values({ trenchId, nullifierHash: hash, trader: entry.trader, verifiedAt: joinedAt });
      await tx.insert(entries).values({ trenchId, trader: entry.trader, nullifierHash: hash, joinedAt });
    });
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (/unique|duplicate key/i.test(msg)) throw conflict("You've already entered this battle.");
    throw e;
  }

  // Public record (Arkiv entry + profile) and the HCS log are independent of each other: run them
  // concurrently. Each failure is reported in the response, never hidden.
  const [arkivRes, profileRes, hcs] = await Promise.all([
    (async (): Promise<JoinResult["arkiv"]> => {
      try {
        const r = await arkiv.createEntry(entry, trench.endAt);
        await db.update(entries).set({ arkivEntityKey: r.entityKey }).where(and(eq(entries.trenchId, trenchId), eq(entries.trader, entry.trader)));
        return { entryKey: r.entityKey, txHash: r.txHash };
      } catch (e) {
        log.error({ trenchId, trader, err: (e as Error).message }, "arkiv createEntry failed");
        return { error: (e as Error).message };
      }
    })(),
    (async (): Promise<JoinResult["profile"]> => {
      try {
        const joined = await db.select({ trenchId: entries.trenchId }).from(entries).where(eq(entries.trader, entry.trader));
        const existing = await arkiv.getProfile(entry.trader);
        const profile: Profile = {
          address: entry.trader,
          verifiedHuman: true,
          trenchesJoined: joined.length,
          ...(existing?.bestFinish !== undefined ? { bestFinish: existing.bestFinish } : {}),
          totalVolumeUsd: existing?.totalVolumeUsd ?? 0,
          totalPnlUsd: existing?.totalPnlUsd ?? 0,
        };
        const r = await arkiv.upsertProfile(profile);
        return { entityKey: r.entityKey, txHash: r.txHash };
      } catch (e) {
        log.error({ trader, err: (e as Error).message }, "arkiv upsertProfile failed");
        return { error: (e as Error).message };
      }
    })(),
    recordHcs(trenchId, trench.hedera.topicId, "entry.joined", { trader: entry.trader, joinedAt, credential: outcome.identifier, mocked: outcome.mocked }),
  ]);

  const { worldIdNullifier: _n, ...publicEntry } = entry;
  void _n;
  return { entry: publicEntry, mocked: outcome.mocked, arkiv: arkivRes, profile: profileRes, hcs };
}

export async function listEntryAddresses(trenchId: string): Promise<Address[]> {
  const { db } = services();
  const rows = await db.select({ trader: entries.trader }).from(entries).where(eq(entries.trenchId, trenchId));
  return rows.map((r) => r.trader as Address);
}
