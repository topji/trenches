import { clanOf, identitiesFor } from "@trenches/services";
import { NextResponse, type NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { requireAddress } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in wallet's clan (if any) and identity. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const me = await requireAddress(req);
    const [clan, ids] = await Promise.all([clanOf(me), identitiesFor([me])]);
    return NextResponse.json({ clan, identity: ids[me.toLowerCase()] ?? null });
  });
}
