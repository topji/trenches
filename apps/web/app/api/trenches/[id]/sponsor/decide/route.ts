import { decideProposal } from "@trenches/services";
import { NextResponse, type NextRequest } from "next/server";
import { handle, readJson } from "@/lib/server/http";
import { requireAddress } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** F9.2: host accepts (`{ accept: true }`) or keeps the current assets. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readJson(req);
    const admin = await requireAddress(req, body);
    return NextResponse.json(await decideProposal(id, admin, body.accept === true));
  });
}
