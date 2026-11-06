import type { Address, LeaderboardRow } from "@trenches/core";

export interface BoardRow {
  trader: Address;
  rank: number;
  pnlUsd: number;
  roiPct: number;
  volumeUsd: number;
  winRate: number | null;
  fills: number;
}

/** Scored rows first (Arkiv `lb`), then entrants without a row at $0.00 in join order. Every entrant is a verified human. */
export function mergeBoard(lb: LeaderboardRow[], entrants: { trader: Address; joinedAt: string }[]): BoardRow[] {
  const scored = [...lb].sort((a, b) => a.rank - b.rank).map((r) => ({ ...r, winRate: r.fills > 0 ? r.winRate : null }));
  const seen = new Set(scored.map((r) => r.trader.toLowerCase()));
  const rest = [...entrants]
    .filter((e) => !seen.has(e.trader.toLowerCase()))
    .sort((a, b) => Date.parse(a.joinedAt) - Date.parse(b.joinedAt))
    .map((e, i) => ({ trader: e.trader, rank: scored.length + i + 1, pnlUsd: 0, roiPct: 0, volumeUsd: 0, winRate: null, fills: 0 }));
  return [...scored, ...rest];
}
