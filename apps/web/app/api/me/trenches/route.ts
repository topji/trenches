import { hostTrenches } from "@trenches/services";
import { NextResponse, type NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { requireAddress } from "@/lib/server/session";
import { trenchLinks } from "@/lib/server/links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** F6: the signed-in host's Trenches with entrants, volume, fees earned, links. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const admin = await requireAddress(req);
    const rows = await hostTrenches(admin);
    return NextResponse.json({ trenches: rows.map((r) => ({ ...r, links: trenchLinks(r.trench, r.arkivEntityKey) })) });
  });
}
