import type { Trench, Address } from "@trenches/core";
import type { NewTrenchRow, TrenchRow } from "./schema.js";

export function rowToTrench(r: TrenchRow): Trench {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    adminAddress: r.adminAddress as Address,
    startAt: new Date(r.startAt).toISOString(),
    endAt: new Date(r.endAt).toISOString(),
    allowedAssets: r.allowedAssets,
    prizePoolUsdc: Number(r.prizePoolUsdc),
    prizeSplit: r.prizeSplit,
    entryRule: r.entryRule as Trench["entryRule"],
    ...(r.inviteCode ? { inviteCode: r.inviteCode } : {}),
    adminFeeShareBps: r.adminFeeShareBps,
    status: r.status as Trench["status"],
    hedera: {
      escrowAccountId: r.escrowAccountId,
      topicId: r.topicId,
      ...(r.fundingTxId ? { fundingTxId: r.fundingTxId } : {}),
      ...(r.payoutTxId ? { payoutTxId: r.payoutTxId } : {}),
      ...(r.scheduleId ? { scheduleId: r.scheduleId } : {}),
    },
    ...(r.sponsor ? { sponsor: r.sponsor } : {}),
    createdAt: new Date(r.createdAt).toISOString(),
  };
}

export function trenchToRow(t: Trench, extra: { arkivEntityKey?: string | null; arkivTxHash?: string | null } = {}): NewTrenchRow {
  const now = new Date().toISOString();
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    description: t.description,
    adminAddress: t.adminAddress.toLowerCase(),
    startAt: t.startAt,
    endAt: t.endAt,
    allowedAssets: t.allowedAssets,
    prizePoolUsdc: t.prizePoolUsdc.toFixed(6),
    prizeSplit: t.prizeSplit,
    entryRule: t.entryRule,
    inviteCode: t.inviteCode ?? null,
    adminFeeShareBps: t.adminFeeShareBps,
    status: t.status,
    escrowAccountId: t.hedera.escrowAccountId,
    topicId: t.hedera.topicId,
    fundingTxId: t.hedera.fundingTxId ?? null,
    payoutTxId: t.hedera.payoutTxId ?? null,
    scheduleId: t.hedera.scheduleId ?? null,
    sponsor: t.sponsor ?? null,
    arkivEntityKey: extra.arkivEntityKey ?? null,
    arkivTxHash: extra.arkivTxHash ?? null,
    createdAt: t.createdAt,
    updatedAt: now,
  };
}
