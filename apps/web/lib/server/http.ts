import { ServiceError, log } from "@trenches/services";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Route-handler wrapper: ServiceError → its status + user-facing message; anything else → 502 with the real message. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ServiceError) {
      return NextResponse.json({ error: e.message, field: e.field }, { status: e.status });
    }
    const message = (e as Error).message ?? "Unknown error";
    log.error({ err: message, stack: (e as Error).stack }, "route failed");
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await req.json()) as unknown;
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
