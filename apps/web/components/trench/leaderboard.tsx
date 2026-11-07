"use client";

import { clsx } from "clsx";
import Link from "next/link";
import { copy } from "@/lib/copy";
import { formatCompactUsd, formatPct, formatPnl } from "@/lib/format";
import { useSession } from "@/lib/session";
import { HumanBadge } from "@/components/ui/human-badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { BoardRow } from "@/lib/board";
import { displayName, type IdentityLite } from "@/lib/identity";

const rankTone = ["text-accent", "text-rank-2", "text-rank-3"];

export function Leaderboard({ rows, settled, flash, identities = {} }: { rows: BoardRow[]; settled?: boolean; flash?: Set<string>; identities?: Record<string, IdentityLite> }) {
  const { address } = useSession();
  const me = address?.toLowerCase();
  if (rows.length === 0) return <EmptyState>{copy.leaderboard.empty}</EmptyState>;
  const c = copy.leaderboard.columns;
  return (
    <div className="overflow-x-auto">
      {settled && <h2 className="text-h2 mb-4">{copy.leaderboard.settled}</h2>}
      <table className="w-full border-t border-line">
        <thead>
          <tr className="text-small text-muted text-left">
            <th scope="col" className="py-2 pr-2 w-[40px]">{c.rank}</th>
            <th scope="col" className="py-2 pr-2">{c.trader}</th>
            <th scope="col" className="py-2 pr-2 text-right">{c.pnl}</th>
            <th scope="col" className="py-2 pr-2 text-right">{c.roi}</th>
            <th scope="col" className="py-2 pr-2 text-right">{c.volume}</th>
            <th scope="col" className="py-2 text-right hidden sm:table-cell">{c.winRate}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const mine = me === r.trader.toLowerCase();
            return (
              <tr
                key={r.trader}
                className={clsx("h-14 border-t border-line row-in row-hover", mine && "border-l-2 border-l-accent", flash?.has(r.trader.toLowerCase()) && "rank-flash")}
                style={{ animationDelay: `${Math.min(i, 10) * 120}ms` }}
              >
                <td className={clsx("pr-2 font-scoreboard text-figure", rankTone[r.rank - 1] ?? "text-text")}>{r.rank}</td>
                <td className="pr-2">
                  <span className="inline-flex items-center gap-2 flex-wrap">
                    <Link href={`/u/${r.trader}`} className={identities[r.trader.toLowerCase()]?.handle ? "font-semibold" : "font-mono text-[13px]"}>
                      {displayName(r.trader, identities[r.trader.toLowerCase()])}
                    </Link>
                    {identities[r.trader.toLowerCase()]?.handle && <span className="text-small text-muted">· {identities[r.trader.toLowerCase()]!.title}</span>}
                    <HumanBadge />
                    {mine && <span className="text-small text-accent">{copy.leaderboard.you}</span>}
                  </span>
                </td>
                <td className={clsx("pr-2 text-right font-scoreboard text-figure tabular", r.pnlUsd > 0 ? "text-gain" : r.pnlUsd < 0 ? "text-loss" : "text-text")}>{formatPnl(r.pnlUsd)}</td>
                <td className="pr-2 text-right tabular text-muted text-small">{formatPct(r.roiPct)}</td>
                <td className="pr-2 text-right tabular text-muted text-small">{formatCompactUsd(r.volumeUsd)}</td>
                <td className="text-right tabular text-muted text-small hidden sm:table-cell">{r.winRate === null ? "—" : `${Math.round(r.winRate * 100)}%`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
