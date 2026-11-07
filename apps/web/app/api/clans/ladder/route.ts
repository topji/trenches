import { ladder } from "@trenches/services";
import { seasonOf } from "@trenches/core";
import { NextResponse, type NextRequest } from "next/server";
import { handle } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public clan ladder for a season (default: this month). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const season = new URL(req.url).searchParams.get("season") ?? seasonOf();
    return NextResponse.json({ season, rows: await ladder(season) }, { headers: { "cache-control": "no-store" } });
  });
}
