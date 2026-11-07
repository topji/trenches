import { sponsorTrench } from "@trenches/services";
import { NextResponse, type NextRequest } from "next/server";
import { handle, readJson } from "@/lib/server/http";
import { requireAddress } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** F9.1: sponsor funds the pool (+ optional asset proposal). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readJson(req);
    const sponsor = await requireAddress(req, body);
    return NextResponse.json(await sponsorTrench(id, sponsor, body), { status: 201 });
  });
}
