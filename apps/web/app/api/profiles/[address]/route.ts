import { profileFor } from "@trenches/services";
import { NextResponse } from "next/server";
import { handle } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** F7: public profile from Arkiv `profile` + `lb` entities. */
export async function GET(_req: Request, ctx: { params: Promise<{ address: string }> }) {
  return handle(async () => {
    const { address } = await ctx.params;
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return NextResponse.json({ error: "Bad address." }, { status: 400 });
    return NextResponse.json(await profileFor(address as `0x${string}`));
  });
}
