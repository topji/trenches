import { listOrdersForTrader, submitOrder } from "@trenches/services";
import { NextResponse, type NextRequest } from "next/server";
import { handle, readJson } from "@/lib/server/http";
import { requireAddress } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Submit a signed quote to Flash. Flash errors come back verbatim with status 400 (F3.4). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readJson(req);
    const trader = await requireAddress(req, body);
    const result = await submitOrder(id, trader, body);
    return NextResponse.json(result, { status: 201 });
  });
}

/** Own orders + fills. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const trader = await requireAddress(req);
    return NextResponse.json({ orders: await listOrdersForTrader(id, trader) });
  });
}
