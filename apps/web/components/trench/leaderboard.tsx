"use client";

import { clsx } from "clsx";
import Link from "next/link";
import { copy } from "@/lib/copy";
import { formatCompactUsd, formatPct, formatPnl, shortAddress } from "@/lib/format";
import { useSession } from "@/lib/session";
import { HumanBadge } from "@/components/ui/human-badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { BoardRow } from "@/lib/board";

const rankTone = ["text-accent", "text-rank-2", "text-rank-3"];

export function Leaderboard({ rows, settled }: { rows: BoardRow[]; settled?: boolean }) {
  const { address } = useSession();
  const me = address?.toLowerCase();
  if (rows.length === 0) return <EmptyState>{copy.leaderboard.empty}</EmptyState>;
  const c = copy.leaderboard.columns;
  return (
    <div className="overflow-x-auto -mx-4 px-4">
      {settled && <h2 className="text-h2 mb-4">{copy.leaderboard.settled}</h2>}
      <table className="w-full min-w-[560px] border-t border-line">
        <thead>
          <tr className="text-small text-muted text-left">
            <th scope="col" className="py-2 pr-2 w-[48px]">{c.rank}</th>
            <th scope="col" className="py-2 pr-2">{c.trader}</th>
            <th scope="col" className="py-2 pr-2 text-right">{c.pnl}</th>
            <th scope="col" className="py-2 pr-2 text-right">{c.roi}</th>
            <th scope="col" className="py-2 pr-2 text-right">{c.volume}</th>
            <th scope="col" className="py-2 text-right">{c.winRate}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const mine = me === r.trader.toLowerCase();
            return (
              <tr
                key={r.trader}
                className={clsx("h-14 border-t border-line row-in", mine && "border-l-2 border-l-accent")}
                style={{ animationDelay: `${Math.min(i, 10) * 120}ms` }}
              >
                <td className={clsx("pr-2 font-scoreboard text-figure", rankTone[r.rank - 1] ?? "text-text")}>{r.rank}</td>
                <td className="pr-2">
                  <span className="inline-flex items-center gap-2">
                    <Link href={`/u/${r.trader}`} className="font-mono text-[13px]">{shortAddress(r.trader)}</Link>
                    <HumanBadge />
                    {mine && <span className="text-small text-accent">{copy.leaderboard.you}</span>}
                  </span>
                </td>
                <td className={clsx("pr-2 text-right font-scoreboard text-figure tabular", r.pnlUsd > 0 ? "text-gain" : r.pnlUsd < 0 ? "text-loss" : "text-text")}>{formatPnl(r.pnlUsd)}</td>
                <td className="pr-2 text-right tabular text-muted">{formatPct(r.roiPct)}</td>
                <td className="pr-2 text-right tabular text-muted">{formatCompactUsd(r.volumeUsd)}</td>
                <td className="text-right tabular text-muted">{r.winRate === null ? "—" : `${Math.round(r.winRate * 100)}%`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
