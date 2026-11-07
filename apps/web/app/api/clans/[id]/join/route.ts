import { joinClan } from "@trenches/services";
import { NextResponse, type NextRequest } from "next/server";
import { handle, readJson } from "@/lib/server/http";
import { requireAddress } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readJson(req);
    const trader = await requireAddress(req, body);
    return NextResponse.json(await joinClan(trader, id, typeof body.inviteCode === "string" ? body.inviteCode : undefined), { status: 201 });
  });
}
