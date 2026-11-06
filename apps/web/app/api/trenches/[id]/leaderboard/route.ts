import { arkivReader } from "@trenches/services";
import { NextResponse } from "next/server";
import { handle } from "@/lib/server/http";
import { mergeBoard } from "@/lib/board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public leaderboard: `trenches.lb` rows from Arkiv (TECH_SPEC §3.3 query 2) merged with entrants at $0.00. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const reader = arkivReader();
    const [lb, entrants] = await Promise.all([reader.getLeaderboard(id), reader.listEntries(id)]);
    const rows = mergeBoard(lb, entrants);
    const computedAt = lb.reduce<string | null>((acc, r) => (!acc || r.computedAt > acc ? r.computedAt : acc), null);
    return NextResponse.json({ rows, computedAt, source: "arkiv" }, { headers: { "cache-control": "no-store" } });
  });
}
