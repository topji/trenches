"use client";

import { clsx } from "clsx";
import Link from "next/link";
import { copy } from "@/lib/copy";
import { formatCompactUsd, formatPct, formatPnl } from "@/lib/format";
import { useSession } from "@/lib/session";
import { HumanBadge } from "@/components/ui/human-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Bar, Medal, TagBadge, TitleChip } from "@/components/ui/medal";
import { PixelAvatar } from "@/components/ui/pixel";
import type { BoardRow } from "@/lib/board";
import { displayName, type IdentityLite } from "@/lib/identity";

const rankTone = ["text-accent", "text-rank-2", "text-rank-3"];

export function Leaderboard({ rows, settled, flash, identities = {} }: { rows: BoardRow[]; settled?: boolean; flash?: Set<string>; identities?: Record<string, IdentityLite> }) {
  const { address } = useSession();
  const me = address?.toLowerCase();
  if (rows.length === 0) return <EmptyState>{copy.leaderboard.empty}</EmptyState>;
  const c = copy.leaderboard.columns;
  const maxAbs = Math.max(0.01, ...rows.map((r) => Math.abs(r.pnlUsd)));
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
                <td className="pr-2"><Medal rank={r.rank} /></td>
                <td className="pr-2">
                  <span className="inline-flex items-center gap-2 flex-wrap">
                    <PixelAvatar seed={r.trader} size={28} />
                    {identities[r.trader.toLowerCase()]?.tag && <TagBadge tag={identities[r.trader.toLowerCase()]!.tag!} />}
                    <Link href={`/u/${r.trader}`} className={identities[r.trader.toLowerCase()]?.handle ? "font-semibold" : "font-mono text-[13px]"}>
                      {identities[r.trader.toLowerCase()]?.handle ?? displayName(r.trader, null)}
                    </Link>
                    {identities[r.trader.toLowerCase()]?.handle && <TitleChip level={identities[r.trader.toLowerCase()]!.level} title={identities[r.trader.toLowerCase()]!.title} />}
                    <HumanBadge />
                    {mine && <span className="text-small text-accent">{copy.leaderboard.you}</span>}
                  </span>
                </td>
                <td className="pr-2 text-right">
                  <span className={clsx("font-scoreboard text-figure tabular", r.pnlUsd > 0 ? "text-gain" : r.pnlUsd < 0 ? "text-loss" : "text-text")}>{formatPnl(r.pnlUsd)}</span>
                  <Bar value={Math.abs(r.pnlUsd) / maxAbs} tone={r.pnlUsd < 0 ? "loss" : "gain"} className="mt-1 ml-auto max-w-[96px]" />
                </td>
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
