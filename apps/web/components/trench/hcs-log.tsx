import { copy } from "@/lib/copy";
import { explorers } from "@/lib/explorers";
import { formatLocalTime } from "@/lib/format";
import { ExplorerLink } from "@/components/ui/explorer-link";
import { toMirrorId } from "@/lib/server/links";

export interface HcsRow {
  event: string;
  sequenceNumber: number;
  txId: string;
  at: string;
}

/** The Trench's HCS messages, newest first, each linked to HashScan. */
export function HcsLog({ rows }: { rows: HcsRow[] }) {
  const sorted = [...rows].sort((a, b) => b.sequenceNumber - a.sequenceNumber);
  return (
    <section aria-labelledby="log-heading">
      <h2 id="log-heading" className="text-h2 mb-4">{copy.trench.log.h2}</h2>
      {sorted.length === 0 ? (
        <p className="text-muted">{copy.trench.log.empty}</p>
      ) : (
        <ol className="border-t border-line">
          {sorted.map((r) => (
            <li key={r.sequenceNumber} className="grid grid-cols-[40px_1fr_auto] gap-x-4 items-center py-3 border-b border-line text-small">
              <span className="font-scoreboard text-[16px] text-muted">{r.sequenceNumber}</span>
              <span>
                <span className="font-mono text-[13px]">{r.event}</span>
                <span className="text-muted"> · {formatLocalTime(r.at)}</span>
              </span>
              <ExplorerLink href={explorers.hashscanTx(toMirrorId(r.txId))} hash={toMirrorId(r.txId)} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
