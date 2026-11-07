import { createClan } from "@trenches/services";
import { NextResponse, type NextRequest } from "next/server";
import { handle, readJson } from "@/lib/server/http";
import { requireAddress } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await readJson(req);
    const leader = await requireAddress(req, body);
    return NextResponse.json(await createClan(leader, body), { status: 201 });
  });
}
