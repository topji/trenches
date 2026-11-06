import { activateTrenches } from "@trenches/services";
import { NextResponse, type NextRequest } from "next/server";
import { handle, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DEMO_MODE only: run the worker's activateTrenches once, optionally with a pretend clock `{ now }`. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    if (process.env.DEMO_MODE !== "true") return NextResponse.json({ error: "Not available." }, { status: 404 });
    const body = await readJson(req);
    const now = typeof body.now === "string" ? new Date(body.now) : new Date();
    const transitions = await activateTrenches(now);
    return NextResponse.json({ now: now.toISOString(), transitions });
  });
}
