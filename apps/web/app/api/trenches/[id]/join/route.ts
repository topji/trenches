import { joinTrench } from "@trenches/services";
import { NextResponse, type NextRequest } from "next/server";
import { handle, readJson } from "@/lib/server/http";
import { requireAddress } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** F2: body `{ result: IDKitResult }`. 401 invalid proof · 409 duplicate / not joinable · 201 entered. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readJson(req);
    const trader = await requireAddress(req, body);
    const result = await joinTrench(id, trader, body.result);
    return NextResponse.json(result, { status: 201 });
  });
}
