import type { Trench } from "@trenches/core";
import { copy } from "@/lib/copy";
import { explorers } from "@/lib/explorers";
import { ExplorerLink } from "@/components/ui/explorer-link";
import { toMirrorId } from "@/lib/server/links";

/** "Escrow 300.00 USDC on Hedera · HashScan · Results log" plus the Arkiv record. Every id is a link. */
export function EscrowLine({ trench, balance, arkivEntityKey }: { trench: Trench; balance: number | null; arkivEntityKey: string | null }) {
  return (
    <div className="panel-sunken p-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-small text-muted">
      <span>{balance === null ? copy.trench.escrowUnknown : copy.trench.escrow(balance.toFixed(2))}</span>
      <ExplorerLink href={explorers.hashscanAccount(trench.hedera.escrowAccountId)} label={copy.trench.viewHashscan} hash={trench.hedera.escrowAccountId} />
      <ExplorerLink href={explorers.hashscanTopic(trench.hedera.topicId)} label={copy.trench.resultsLog} hash={trench.hedera.topicId} />
      {trench.hedera.fundingTxId && (
        <ExplorerLink href={explorers.hashscanTx(toMirrorId(trench.hedera.fundingTxId))} label="Funding tx" hash={toMirrorId(trench.hedera.fundingTxId)} />
      )}
      {trench.hedera.payoutTxId && (
        <ExplorerLink href={explorers.hashscanTx(toMirrorId(trench.hedera.payoutTxId))} label={copy.trench.payoutTx} hash={toMirrorId(trench.hedera.payoutTxId)} />
      )}
      {trench.hedera.scheduleId && (
        <ExplorerLink href={explorers.hashscanSchedule(trench.hedera.scheduleId)} label={copy.trench.feeShare} hash={trench.hedera.scheduleId} />
      )}
      {arkivEntityKey ? (
        <ExplorerLink href={explorers.arkivEntity(arkivEntityKey)} label={copy.trench.publicRecord} hash={arkivEntityKey} />
      ) : (
        <span className="text-warn">{copy.funding.arkivPending}</span>
      )}
    </div>
  );
}
