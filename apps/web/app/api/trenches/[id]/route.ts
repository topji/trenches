import { arkivReader, escrowBalance, getTrenchRow, listHcs, notFound, rowToTrenchSafe } from "@/lib/server/trench-read";
import { NextResponse } from "next/server";
import { handle } from "@/lib/server/http";
import { trenchLinks } from "@/lib/server/links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Trench + escrow status (Mirror) + HCS log. The Trench itself comes from Arkiv; Postgres is the fallback while an Arkiv write is pending. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const onArkiv = await arkivReader().getTrenchById(id);
    const row = await getTrenchRow(id);
    const trench = onArkiv ?? (row ? rowToTrenchSafe(row) : null);
    if (!trench) throw notFound();
    const [balance, log] = await Promise.all([escrowBalance(trench.hedera.escrowAccountId), listHcs(trench.id)]);
    return NextResponse.json({
      trench,
      source: onArkiv ? "arkiv" : "postgres",
      arkivEntityKey: onArkiv?.entityKey ?? row?.arkivEntityKey ?? null,
      escrowBalanceUsdc: balance,
      hcs: log,
      links: trenchLinks(trench, onArkiv?.entityKey ?? row?.arkivEntityKey ?? null),
    });
  });
}
