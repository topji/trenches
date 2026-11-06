import type { Trench } from "@trenches/core";
import { explorers } from "@/lib/explorers";

/** Every on-chain id a Trench carries, as explorer URLs (CLAUDE.md rule 7). */
export function trenchLinks(t: Trench, arkivEntityKey: string | null) {
  return {
    escrow: explorers.hashscanAccount(t.hedera.escrowAccountId),
    topic: explorers.hashscanTopic(t.hedera.topicId),
    fundingTx: t.hedera.fundingTxId ? explorers.hashscanTx(toMirrorId(t.hedera.fundingTxId)) : null,
    payoutTx: t.hedera.payoutTxId ? explorers.hashscanTx(toMirrorId(t.hedera.payoutTxId)) : null,
    schedule: t.hedera.scheduleId ? explorers.hashscanSchedule(t.hedera.scheduleId) : null,
    arkivEntity: arkivEntityKey ? explorers.arkivEntity(arkivEntityKey) : null,
  };
}

/** "0.0.1@1699999999.123456789" → "0.0.1-1699999999-123456789" (HashScan URL form). */
export function toMirrorId(sdkId: string): string {
  const base = sdkId.split("?")[0]!.split("/")[0]!;
  if (!base.includes("@")) return base;
  const [payer, ts] = base.split("@");
  const [sec, nanos = "0"] = (ts ?? "").split(".");
  return `${payer}-${sec}-${nanos.padEnd(9, "0")}`;
}
