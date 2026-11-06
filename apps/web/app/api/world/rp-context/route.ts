import { issueRpContext } from "@trenches/services";
import { NextResponse, type NextRequest } from "next/server";
import { handle } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Signed rp_context for the IDKit widget (docs/integrations/world.md §3). Nonce persisted, 300 s TTL. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const trenchId = new URL(req.url).searchParams.get("trenchId") ?? "";
    return NextResponse.json(await issueRpContext(trenchId));
  });
}
