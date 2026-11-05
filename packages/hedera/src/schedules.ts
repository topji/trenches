import {
  ScheduleCreateTransaction,
  ScheduleInfoQuery,
  ScheduleSignTransaction,
  Timestamp,
  TransferTransaction,
  type PrivateKey,
} from "@hiero-ledger/sdk";
import type { HederaContext } from "./client.js";
import type { TokenLeg } from "./tokens.js";

export const SCHEDULE_MAX_SECONDS = 62 * 24 * 3600; // HIP-423 cap on testnet (docs §5.2)

export interface CreatedSchedule {
  scheduleId: string;
  scheduledTxId: string;
  createTxId: string;
}

/**
 * Long-term scheduled token transfer (HIP-423): created now, executes at `executeAt` once every
 * debited account has signed. Used for the admin fee-share payout whose recipient is known at creation.
 * Signers we hold are applied at creation; others can ScheduleSign later.
 */
export async function scheduleTokenTransfer(
  ctx: HederaContext,
  tokenId: string,
  legs: TokenLeg[],
  executeAt: Date,
  opts: { signers?: PrivateKey[]; memo?: string; waitForExpiry?: boolean } = {},
): Promise<CreatedSchedule> {
  const sum = legs.reduce((a, l) => a + l.amount, 0n);
  if (sum !== 0n) throw new Error("Scheduled transfer legs must net to zero");
  const secondsAway = (executeAt.getTime() - Date.now()) / 1000;
  if (secondsAway > SCHEDULE_MAX_SECONDS) throw new Error("Schedule expiration is beyond the 62-day limit");

  let inner = new TransferTransaction();
  for (const l of legs) inner = inner.addTokenTransfer(tokenId, l.accountId, l.amount);
  if (opts.memo) inner.setTransactionMemo(opts.memo.slice(0, 100));

  const create = new ScheduleCreateTransaction()
    .setScheduledTransaction(inner)
    .setPayerAccountId(ctx.operatorId)
    .setWaitForExpiry(opts.waitForExpiry ?? true)
    .setScheduleMemo((opts.memo ?? "trenches schedule").slice(0, 100));
  if (secondsAway > 0) create.setExpirationTime(Timestamp.fromDate(executeAt));
  const frozen = await create.freezeWith(ctx.client);
  let signed = frozen;
  for (const k of opts.signers ?? []) signed = await signed.sign(k);
  const resp = await signed.execute(ctx.client);
  const receipt = await resp.getReceipt(ctx.client);
  if (!receipt.scheduleId) throw new Error("ScheduleCreate receipt had no scheduleId");
  return {
    scheduleId: receipt.scheduleId.toString(),
    scheduledTxId: receipt.scheduledTransactionId?.toString() ?? "",
    createTxId: resp.transactionId.toString(),
  };
}

export async function signSchedule(ctx: HederaContext, scheduleId: string, key: PrivateKey): Promise<string> {
  const tx = await new ScheduleSignTransaction().setScheduleId(scheduleId).freezeWith(ctx.client);
  const signed = await tx.sign(key);
  const resp = await signed.execute(ctx.client);
  await resp.getReceipt(ctx.client);
  return resp.transactionId.toString();
}

export async function getScheduleInfo(ctx: HederaContext, scheduleId: string) {
  const info = await new ScheduleInfoQuery().setScheduleId(scheduleId).execute(ctx.client);
  return {
    scheduleId: info.scheduleId.toString(),
    executed: info.executed ? info.executed.toDate().toISOString() : null,
    deleted: info.deleted ? info.deleted.toDate().toISOString() : null,
    expirationTime: info.expirationTime ? info.expirationTime.toDate().toISOString() : null,
    waitForExpiry: info.waitForExpiry,
    memo: info.scheduleMemo,
  };
}
