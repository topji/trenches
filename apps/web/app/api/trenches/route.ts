import { arkivReader, createTrench } from "@trenches/services";
import type { TrenchStatus } from "@trenches/core";
import { NextResponse, type NextRequest } from "next/server";
import { handle, readJson } from "@/lib/server/http";
import { requireAddress } from "@/lib/server/session";
import { trenchLinks } from "@/lib/server/links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Discovery list straight from Arkiv (TECH_SPEC §3.3 query 1). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const url = new URL(req.url);
    const statuses = (url.searchParams.get("status")?.split(",").filter(Boolean) as TrenchStatus[] | undefined) ?? ["funded", "live"];
    const asset = url.searchParams.get("asset") ?? undefined;
    const rows = await arkivReader().listTrenches({ statuses, asset });
    rows.sort((a, b) => b.prizePoolUsdc - a.prizePoolUsdc);
    return NextResponse.json({ trenches: rows, source: "arkiv" });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await readJson(req);
    const admin = await requireAddress(req, body);
    const result = await createTrench(body, admin);
    return NextResponse.json({ ...result, links: trenchLinks(result.trench, "entityKey" in result.arkiv ? result.arkiv.entityKey : null) }, { status: 201 });
  });
}
