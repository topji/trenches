import { fundTrench } from "@trenches/services";
import { NextResponse, type NextRequest } from "next/server";
import { handle, readJson } from "@/lib/server/http";
import { requireAddress } from "@/lib/server/session";
import { trenchLinks } from "@/lib/server/links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readJson(req);
    const actor = await requireAddress(req, body);
    const result = await fundTrench(id, actor);
    return NextResponse.json({ ...result, links: trenchLinks(result.trench, null) });
  });
}
