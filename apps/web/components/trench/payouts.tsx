import type { Payout } from "@trenches/core";
import { copy } from "@/lib/copy";
import { explorers } from "@/lib/explorers";
import { formatUsd, shortAddress } from "@/lib/format";
import { toMirrorId } from "@/lib/server/links";
import { ExplorerLink } from "@/components/ui/explorer-link";

/** Settled Trench: who was paid what, each row linked to the HashScan payout transaction (F5.1). */
export function Payouts({ rows }: { rows: Payout[] }) {
  const c = copy.trench.payouts.columns;
  return (
    <section aria-labelledby="payouts-heading" className="flex flex-col gap-4">
      <h2 id="payouts-heading" className="text-h2">{copy.trench.payouts.h2}</h2>
      {rows.length === 0 ? (
        <p className="text-muted">{copy.trench.payouts.none}</p>
      ) : (
        <table className="w-full border-t border-line">
          <thead>
            <tr className="text-small text-muted text-left">
              <th scope="col" className="py-2 pr-2 w-[40px]">{c.rank}</th>
              <th scope="col" className="py-2 pr-2">{c.trader}</th>
              <th scope="col" className="py-2 pr-2 text-right">{c.amount}</th>
              <th scope="col" className="py-2 text-right">{c.tx}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.trader} className="h-14 border-t border-line">
                <td className="pr-2 font-scoreboard text-figure text-accent">{p.rank}</td>
                <td className="pr-2 font-mono text-[13px]">{shortAddress(p.trader)}</td>
                <td className="pr-2 text-right font-scoreboard text-figure tabular text-gain">{formatUsd(p.amountUsdc)}</td>
                <td className="text-right text-small">
                  <ExplorerLink href={explorers.hashscanTx(toMirrorId(p.hederaTxId))} hash={toMirrorId(p.hederaTxId)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
