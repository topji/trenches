import { fastForward } from "@trenches/services";
import { NextResponse, type NextRequest } from "next/server";
import { handle, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DEMO_MODE + DEMO_SECRET only: end a Trench now and settle it immediately (TECH_SPEC §5). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    if (process.env.DEMO_MODE !== "true") return NextResponse.json({ error: "Not available." }, { status: 404 });
    if (!process.env.DEMO_SECRET || req.headers.get("x-trenches-demo") !== process.env.DEMO_SECRET) return NextResponse.json({ error: "Not available." }, { status: 404 });
    const body = await readJson(req);
    const trenchId = typeof body.trenchId === "string" ? body.trenchId : "";
    if (!trenchId) return NextResponse.json({ error: "trenchId required." }, { status: 400 });
    return NextResponse.json(await fastForward(trenchId));
  });
}
