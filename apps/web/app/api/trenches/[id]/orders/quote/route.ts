import { quoteOrder } from "@trenches/services";
import { NextResponse, type NextRequest } from "next/server";
import { handle, readJson } from "@/lib/server/http";
import { requireAddress } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** F3: window + asset + entered checks → Flash quote with the platform fee. `preview: true` skips persistence. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readJson(req);
    const trader = await requireAddress(req, body);
    return NextResponse.json(await quoteOrder(id, trader, body));
  });
}
