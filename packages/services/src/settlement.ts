/**
 * F5: at endAt the pool pays itself out. final board → HCS `leaderboard.final` → HTS transfer from the
 * Trench's escrow (its own key, decrypted here) to the winners per prizeSplit → HCS `trench.paid` →
 * `trenches.payout` entities on Arkiv → status settled. The host's accrued fee share is paid by a
 * HIP-423 Scheduled Transaction created at settlement (amount is only known then) that executes on
 * its own a few minutes later with waitForExpiry — recipient fixed at creation, no Solidity.
 */
import { splitPrize, toBaseUnits, type Address, type Payout, type Trench } from "@trenches/core";
import { and, eq, feeLedger, isNull, leaderboard, rowToTrench, escrowKeys, sql, trenches, winnerAccounts } from "@trenches/db";
import { createEscrowAccount, decryptSecret, encryptSecret, parsePrivateKey, scheduleTokenTransfer, transferToken } from "@trenches/hedera";
import { log, services } from "./context.js";
import { recomputeLeaderboard } from "./leaderboard.js";
import { recordHcs, withArkivRetry, type HcsRecord } from "./trenches.js";

export const FEE_SHARE_DELAY_MS = 3 * 60_000;

export interface WinnerPayout {
  rank: number;
  trader: Address;
  accountId: string;
  amountUsdc: number;
}

export interface SettlementResult {
  trenchId: string;
  slug: string;
  winners: WinnerPayout[];
  payoutTxId: string | null;
  finalMsg: HcsRecord | { error: string };
  paidMsg: HcsRecord | { error: string } | null;
  feeShare: { amountUsdc: number; scheduleId: string | null; executeAt: string | null; error?: string };
  arkivPayoutsTx?: string;
  arkivTrenchTx?: string;
  arkivError?: string;
  paidAt: string;
}

function envWinnerMap(): Record<string, string> {
  try {
    const raw = process.env.DEMO_WINNER_ACCOUNTS?.trim();
    if (!raw) return {};
    const m = JSON.parse(raw) as Record<string, string>;
    return Object.fromEntries(Object.entries(m).map(([k, v]) => [k.toLowerCase(), v]));
  } catch {
    log.warn("DEMO_WINNER_ACCOUNTS is not valid JSON; ignoring");
    return {};
  }
}

/** Hedera account for a trader: env map → stored → create one (unlimited auto-association, key encrypted). */
export async function winnerAccountFor(trader: Address): Promise<{ accountId: string; source: string }> {
  const { db, hedera, config } = services();
  const key = trader.toLowerCase();
  const fromEnv = envWinnerMap()[key];
  if (fromEnv) return { accountId: fromEnv, source: "env" };
  const [stored] = await db.select().from(winnerAccounts).where(eq(winnerAccounts.trader, key)).limit(1);
  if (stored) return { accountId: stored.accountId, source: stored.source };
  const acct = await createEscrowAccount(hedera, `trenches winner ${key.slice(0, 10)}`, 0.5);
  await db.insert(winnerAccounts).values({
    trader: key,
    accountId: acct.accountId,
    encryptedKey: encryptSecret(acct.privateKeyDer, config.escrowSecret),
    source: "created",
    createdAt: new Date().toISOString(),
  });
  log.info({ trader: key, accountId: acct.accountId }, "winner account created");
  return { accountId: acct.accountId, source: "created" };
}

/** Settle one ended Trench. Claims it first so a second worker cannot pay twice. */
export async function settleTrench(trenchId: string, now = new Date()): Promise<SettlementResult | null> {
  const { db, arkiv, hedera, config } = services();
  const nowIso = now.toISOString();
  const [claimed] = await db
    .update(trenches)
    .set({ settlementStartedAt: nowIso, updatedAt: nowIso })
    .where(and(eq(trenches.id, trenchId), eq(trenches.status, "ended"), isNull(trenches.settlementStartedAt)))
    .returning();
  if (!claimed) return null;
  const trench = rowToTrench(claimed);

  // 1. Final board (recompute once more so the mark is as of now ≈ endAt)
  await recomputeLeaderboard(trenchId, now).catch((e) => log.warn({ trenchId, err: (e as Error).message }, "final recompute failed; using last board"));
  const board = await db.select().from(leaderboard).where(eq(leaderboard.trenchId, trenchId)).orderBy(leaderboard.rank);
  const finalMsg = await recordHcs(trenchId, trench.hedera.topicId, "leaderboard.final", {
    n: board.length,
    rows: board.slice(0, 20).map((r) => ({ r: r.rank, t: r.trader.slice(0, 10), p: Math.round(Number(r.pnlUsd) * 100) / 100 })),
  });

  // 2. Winners per prizeSplit (remainder + unfilled places → rank 1)
  const pool = toBaseUnits(trench.prizePoolUsdc);
  const amounts = splitPrize(pool, trench.prizeSplit, board.length);
  const winners: WinnerPayout[] = [];
  for (let i = 0; i < amounts.length; i++) {
    const row = board[i]!;
    const { accountId } = await winnerAccountFor(row.trader as Address);
    winners.push({ rank: row.rank, trader: row.trader as Address, accountId, amountUsdc: Number(amounts[i]!) / 1e6 });
  }

  // 3. Payout from escrow, signed with the Trench's own escrow key
  let payoutTxId: string | null = null;
  let paidMsg: SettlementResult["paidMsg"] = null;
  if (winners.length) {
    const [keyRow] = await db.select().from(escrowKeys).where(eq(escrowKeys.trenchId, trenchId)).limit(1);
    if (!keyRow) throw new Error(`No escrow key for ${trenchId}`);
    const escrowKey = parsePrivateKey(decryptSecret(keyRow.encryptedKey, config.escrowSecret));
    const legs = [
      { accountId: trench.hedera.escrowAccountId, amount: -pool },
      ...winners.map((w, i) => ({ accountId: w.accountId, amount: amounts[i]! })),
    ];
    payoutTxId = await transferToken(hedera, config.prizeTokenId, legs, [escrowKey], `trenches payout ${trench.slug}`);
    paidMsg = await recordHcs(trenchId, trench.hedera.topicId, "trench.paid", {
      payoutTxId,
      tokenId: config.prizeTokenId,
      winners: winners.map((w) => ({ r: w.rank, t: w.trader.slice(0, 10), a: w.accountId, usdc: w.amountUsdc })),
    });
  } else {
    log.warn({ trenchId }, "no entrants on the board; pool stays in escrow");
  }

  // 4. Host fee share → Scheduled Transaction (treasury → admin account), executes on its own after a delay
  const totals = await db.select({ total: sql<string>`coalesce(sum(${feeLedger.adminUsd}), 0)` }).from(feeLedger).where(eq(feeLedger.trenchId, trenchId));
  const feeShareUsdc = Math.round(Number(totals[0]?.total ?? 0) * 1e6) / 1e6;
  const feeShare: SettlementResult["feeShare"] = { amountUsdc: feeShareUsdc, scheduleId: null, executeAt: null };
  const adminAccount = process.env.ADMIN_HEDERA_ACCOUNT_ID?.trim();
  if (feeShareUsdc > 0 && adminAccount) {
    try {
      const executeAt = new Date(now.getTime() + FEE_SHARE_DELAY_MS);
      const sched = await scheduleTokenTransfer(
        hedera,
        config.prizeTokenId,
        [
          { accountId: hedera.operatorId.toString(), amount: -toBaseUnits(feeShareUsdc) },
          { accountId: adminAccount, amount: toBaseUnits(feeShareUsdc) },
        ],
        executeAt,
        { memo: `trenches fee share ${trench.slug}`, waitForExpiry: true },
      );
      feeShare.scheduleId = sched.scheduleId;
      feeShare.executeAt = executeAt.toISOString();
      await recordHcs(trenchId, trench.hedera.topicId, "fee_share.scheduled", { scheduleId: sched.scheduleId, executeAt: feeShare.executeAt, usdc: feeShareUsdc, to: adminAccount });
    } catch (e) {
      feeShare.error = (e as Error).message;
      log.error({ trenchId, err: feeShare.error }, "fee share schedule failed");
    }
  }

  // 5. Persist: settled + ids, payout entities + Trench patch on Arkiv
  const paidAt = nowIso;
  const settled: Trench = {
    ...trench,
    status: "settled",
    hedera: { ...trench.hedera, ...(payoutTxId ? { payoutTxId } : {}), ...(feeShare.scheduleId ? { scheduleId: feeShare.scheduleId } : {}) },
  };
  await db
    .update(trenches)
    .set({ status: "settled", payoutTxId, scheduleId: feeShare.scheduleId, paidAt: payoutTxId ? paidAt : null, updatedAt: nowIso })
    .where(eq(trenches.id, trenchId));

  const out: SettlementResult = { trenchId, slug: trench.slug, winners, payoutTxId, finalMsg, paidMsg, feeShare, paidAt };
  try {
    if (payoutTxId) {
      const payouts: Payout[] = winners.map((w) => ({ trenchId, trader: w.trader, rank: w.rank, amountUsdc: w.amountUsdc, hederaTxId: payoutTxId!, paidAt }));
      const r = await withArkivRetry("createPayouts", () => arkiv.createPayouts(payouts));
      out.arkivPayoutsTx = r.txHash;
    }
    if (claimed.arkivEntityKey) {
      const r = await withArkivRetry("updateTrench", () => arkiv.updateTrench(settled, claimed.arkivEntityKey as `0x${string}`));
      out.arkivTrenchTx = r.txHash;
    }
  } catch (e) {
    out.arkivError = (e as Error).message;
    log.error({ trenchId, err: out.arkivError }, "arkiv settlement write failed");
  }
  log.info({ trenchId, slug: trench.slug, winners: winners.length, payoutTxId, scheduleId: feeShare.scheduleId }, "trench settled");
  return out;
}

/** Worker job every 60 s: settle every ended Trench not yet claimed. */
export async function settleTrenches(now = new Date()): Promise<SettlementResult[]> {
  const { db } = services();
  const ended = await db.select({ id: trenches.id }).from(trenches).where(and(eq(trenches.status, "ended"), isNull(trenches.settlementStartedAt)));
  const out: SettlementResult[] = [];
  for (const t of ended) {
    try {
      const r = await settleTrench(t.id, now);
      if (r) out.push(r);
    } catch (e) {
      log.error({ trenchId: t.id, err: (e as Error).message }, "settleTrench failed");
      // release the claim so the next tick retries (payout never happened if we threw before transferToken)
      await db.update(trenches).set({ settlementStartedAt: null }).where(and(eq(trenches.id, t.id), isNull(trenches.payoutTxId)));
    }
  }
  return out;
}

/** DEMO_MODE: end a live Trench now and settle it immediately. */
export async function fastForward(trenchId: string): Promise<{ ended: boolean; settlement: SettlementResult | null }> {
  const { db, arkiv } = services();
  const now = new Date();
  const nowIso = now.toISOString();
  const [row] = await db.select().from(trenches).where(eq(trenches.id, trenchId)).limit(1);
  if (!row) return { ended: false, settlement: null };
  let ended = false;
  if (row.status === "funded" || row.status === "live") {
    const [claimed] = await db
      .update(trenches)
      .set({ status: "ended", endAt: nowIso, updatedAt: nowIso })
      .where(and(eq(trenches.id, trenchId), sql`${trenches.status} in ('funded', 'live')`))
      .returning();
    if (claimed) {
      ended = true;
      const t = rowToTrench(claimed);
      if (claimed.arkivEntityKey) await withArkivRetry("updateTrench", () => arkiv.updateTrench(t, claimed.arkivEntityKey as `0x${string}`)).catch((e) => log.error({ trenchId, err: (e as Error).message }, "arkiv ended patch failed"));
      await recordHcs(trenchId, t.hedera.topicId, "trench.ended", { at: nowIso, startAt: t.startAt, endAt: t.endAt, fastForward: true });
    }
  }
  const settlement = await settleTrench(trenchId, now);
  return { ended, settlement };
}
