/**
 * F1: create → fund → activate. Every external write is recorded with its explorer id, and a
 * failure stays a failure (no state is marked funded/live without the tx behind it).
 */
import {
  createTrenchSchema,
  newId,
  newInviteCode,
  slugify,
  toBaseUnits,
  type Address,
  type CreateTrenchInput,
  type Trench,
  type TrenchStatus,
} from "@trenches/core";
import { and, eq, escrowKeys, hcsMessages, lte, rowToTrench, trenchToRow, trenches } from "@trenches/db";
import { buildMessage, createEscrowAccount, createTopic, encryptSecret, fundFromOperator, submitMessage } from "@trenches/hedera";
import { ZodError } from "zod";
import { log, services } from "./context.js";
import { ServiceError, badRequest, conflict, forbidden, notFound } from "./errors.js";

export interface CreateResult {
  trench: Trench;
  arkiv: { entityKey: string; txHash: string } | { error: string };
  hedera: { escrowTxId: string; topicTxId: string; createdMsg: HcsRecord | { error: string } };
}

export interface HcsRecord {
  event: string;
  sequenceNumber: number;
  txId: string;
  at: string;
}

function firstZodIssue(e: ZodError): { message: string; field?: string } {
  const i = e.issues[0];
  return { message: i?.message ?? "Invalid input.", field: i?.path?.map(String).join(".") };
}

/** Submit an HCS event and record it; never throws (the caller decides what a failed message means). */
export async function recordHcs(trenchId: string, topicId: string, event: string, payload: unknown): Promise<HcsRecord | { error: string }> {
  const { db, hedera } = services();
  const at = new Date().toISOString();
  try {
    const msg = await submitMessage(hedera, topicId, buildMessage(event, trenchId, payload, at));
    await db.insert(hcsMessages).values({ trenchId, topicId, event, sequenceNumber: msg.sequenceNumber, txId: msg.txId, at });
    return { event, sequenceNumber: msg.sequenceNumber, txId: msg.txId, at };
  } catch (e) {
    log.error({ trenchId, event, err: (e as Error).message }, "hcs submit failed");
    return { error: (e as Error).message };
  }
}

export async function createTrench(raw: unknown, adminAddress: Address): Promise<CreateResult> {
  const { db, arkiv, hedera, config } = services();
  let input: ReturnType<ReturnType<typeof createTrenchSchema>["parse"]>;
  try {
    input = createTrenchSchema({ demoMode: config.demoMode }).parse(raw as CreateTrenchInput);
  } catch (e) {
    if (e instanceof ZodError) {
      const { message, field } = firstZodIssue(e);
      throw badRequest(message, field);
    }
    throw e;
  }

  const id = newId();
  const slug = slugify(input.name);
  const createdAt = new Date().toISOString();

  // 1. Hedera: escrow account + topic (money and audit log exist before anything is public)
  const escrow = await createEscrowAccount(hedera, `trenches escrow ${slug}`);
  const topic = await createTopic(hedera, `trenches ${slug}`);

  const trench: Trench = {
    id,
    slug,
    name: input.name,
    description: input.description,
    adminAddress,
    startAt: new Date(input.startAt).toISOString(),
    endAt: new Date(input.endAt).toISOString(),
    allowedAssets: input.allowedAssets,
    prizePoolUsdc: input.prizePoolUsdc,
    prizeSplit: input.prizeSplit,
    entryRule: input.entryRule,
    ...(input.entryRule === "invite" ? { inviteCode: newInviteCode() } : {}),
    adminFeeShareBps: input.adminFeeShareBps,
    status: "draft",
    hedera: { escrowAccountId: escrow.accountId, topicId: topic.topicId },
    createdAt,
  };

  // 2. Arkiv: the public record. A failure is stored as pending and surfaced, never hidden.
  let arkivResult: CreateResult["arkiv"];
  try {
    const r = await arkiv.createTrench(trench);
    arkivResult = { entityKey: r.entityKey, txHash: r.txHash };
  } catch (e) {
    log.error({ trenchId: id, err: (e as Error).message }, "arkiv createTrench failed");
    arkivResult = { error: (e as Error).message };
  }

  // 3. Postgres mirror + encrypted escrow key
  await db.transaction(async (tx) => {
    await tx.insert(trenches).values(
      trenchToRow(trench, "entityKey" in arkivResult ? { arkivEntityKey: arkivResult.entityKey, arkivTxHash: arkivResult.txHash } : {}),
    );
    await tx.insert(escrowKeys).values({
      trenchId: id,
      accountId: escrow.accountId,
      encryptedKey: encryptSecret(escrow.privateKeyDer, config.escrowSecret),
      publicKeyDer: escrow.publicKeyDer,
      createdAt,
    });
  });

  // 4. HCS: trench.created
  const createdMsg = await recordHcs(id, topic.topicId, "trench.created", {
    slug,
    name: trench.name,
    admin: adminAddress,
    escrow: escrow.accountId,
    startAt: trench.startAt,
    endAt: trench.endAt,
    poolUsdc: trench.prizePoolUsdc,
    assets: trench.allowedAssets.map((a) => a.symbol),
    arkivEntityKey: "entityKey" in arkivResult ? arkivResult.entityKey : null,
  });

  return { trench, arkiv: arkivResult, hedera: { escrowTxId: escrow.txId, topicTxId: topic.txId, createdMsg } };
}

export async function getTrenchRow(id: string) {
  const { db } = services();
  const [row] = await db.select().from(trenches).where(eq(trenches.id, id)).limit(1);
  return row ?? null;
}

export async function getTrenchRowBySlug(slug: string) {
  const { db } = services();
  const [row] = await db.select().from(trenches).where(eq(trenches.slug, slug)).limit(1);
  return row ?? null;
}

/** Persist a status (and optional hedera ids) in Postgres and patch the Arkiv entity in place. */
async function persistTrench(trench: Trench, arkivEntityKey: string | null): Promise<{ arkivTxHash?: string; arkivError?: string }> {
  const { db, arkiv } = services();
  await db
    .update(trenches)
    .set({
      status: trench.status,
      fundingTxId: trench.hedera.fundingTxId ?? null,
      payoutTxId: trench.hedera.payoutTxId ?? null,
      scheduleId: trench.hedera.scheduleId ?? null,
      prizePoolUsdc: trench.prizePoolUsdc.toFixed(6),
      sponsor: trench.sponsor ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(trenches.id, trench.id));
  try {
    if (arkivEntityKey) {
      const r = await arkiv.updateTrench(trench, arkivEntityKey as `0x${string}`);
      return { arkivTxHash: r.txHash };
    }
    // Entity never landed (arkivPending): create it now.
    const r = await arkiv.createTrench(trench);
    await db.update(trenches).set({ arkivEntityKey: r.entityKey, arkivTxHash: r.txHash }).where(eq(trenches.id, trench.id));
    return { arkivTxHash: r.txHash };
  } catch (e) {
    log.error({ trenchId: trench.id, err: (e as Error).message }, "arkiv update failed");
    return { arkivError: (e as Error).message };
  }
}

export interface FundResult {
  trench: Trench;
  fundingTxId: string;
  arkivTxHash?: string;
  arkivError?: string;
  fundedMsg: HcsRecord | { error: string };
}

/** The treasury funds the escrow on the host's confirmation (DECISIONS.md), then status → funded. */
export async function fundTrench(id: string, actor: Address): Promise<FundResult> {
  const { hedera, config } = services();
  const row = await getTrenchRow(id);
  if (!row) throw notFound();
  if (row.adminAddress !== actor.toLowerCase()) throw forbidden();
  if (row.status !== "draft") throw conflict("This Trench is already funded.");
  const trench = rowToTrench(row);

  const amount = toBaseUnits(trench.prizePoolUsdc);
  const fundingTxId = await fundFromOperator(hedera, config.prizeTokenId, trench.hedera.escrowAccountId, amount, `trenches fund ${trench.slug}`);

  const funded: Trench = { ...trench, status: "funded", hedera: { ...trench.hedera, fundingTxId } };
  const arkivRes = await persistTrench(funded, row.arkivEntityKey);
  const fundedMsg = await recordHcs(id, trench.hedera.topicId, "trench.funded", {
    fundingTxId,
    amountUsdc: trench.prizePoolUsdc,
    tokenId: config.prizeTokenId,
    escrow: trench.hedera.escrowAccountId,
  });
  return { trench: funded, fundingTxId, ...arkivRes, fundedMsg };
}

export interface Transition {
  trenchId: string;
  slug: string;
  from: TrenchStatus;
  to: TrenchStatus;
  arkivTxHash?: string;
  arkivError?: string;
  hcs: HcsRecord | { error: string };
}

/** Worker job: funded → live at startAt, live → ended at endAt. Idempotent; one pass per tick. */
export async function activateTrenches(now = new Date()): Promise<Transition[]> {
  const { db } = services();
  const nowIso = now.toISOString();
  const out: Transition[] = [];

  const toLive = await db.select().from(trenches).where(and(eq(trenches.status, "funded"), lte(trenches.startAt, nowIso)));
  const toEnded = await db.select().from(trenches).where(and(eq(trenches.status, "live"), lte(trenches.endAt, nowIso)));

  for (const [rows, to, event] of [
    [toLive, "live", "trench.live"],
    [toEnded, "ended", "trench.ended"],
  ] as const) {
    for (const row of rows) {
      const t = rowToTrench(row);
      const next: Trench = { ...t, status: to };
      const arkivRes = await persistTrench(next, row.arkivEntityKey);
      const hcs = await recordHcs(t.id, t.hedera.topicId, event, { at: nowIso, startAt: t.startAt, endAt: t.endAt });
      out.push({ trenchId: t.id, slug: t.slug, from: t.status, to, ...arkivRes, hcs });
      log.info({ trenchId: t.id, slug: t.slug, from: t.status, to }, "trench status changed");
    }
  }
  return out;
}

export async function listHcs(trenchId: string): Promise<HcsRecord[]> {
  const { db } = services();
  const rows = await db.select().from(hcsMessages).where(eq(hcsMessages.trenchId, trenchId));
  return rows.map((r) => ({ event: r.event, sequenceNumber: r.sequenceNumber, txId: r.txId, at: new Date(r.at).toISOString() }));
}

/** Escrow balance in whole USDC from the Mirror Node (null if the mirror is unreachable). */
export async function escrowBalance(escrowAccountId: string): Promise<number | null> {
  const { mirror, config } = services();
  try {
    const units = await mirror.tokenBalance(escrowAccountId, config.prizeTokenId);
    return Number(units) / 1e6;
  } catch (e) {
    log.warn({ escrowAccountId, err: (e as Error).message }, "mirror balance failed");
    return null;
  }
}

export { ServiceError };
