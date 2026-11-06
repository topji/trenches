import type { Address } from "@trenches/core";
import { ServiceError } from "@trenches/services";
import type { NextRequest } from "next/server";
import { addressFromPrivyToken } from "./privy";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Who is calling a mutating route.
 * 1. `Authorization: Bearer <Privy access token>` → verified with the app secret → the user's wallet.
 * 2. DEMO_MODE only: `x-trenches-demo: <DEMO_SECRET>` + `x-trenches-address` (Playwright, demo scripts).
 */
export async function requireAddress(req: NextRequest, _body?: Record<string, unknown>): Promise<Address> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const address = await addressFromPrivyToken(auth.slice(7).trim(), req.headers.get("privy-id-token"));
    if (address) return address;
    throw new ServiceError(401, "Sign in to continue.");
  }
  if (process.env.DEMO_MODE === "true" && process.env.DEMO_SECRET) {
    const secret = req.headers.get("x-trenches-demo");
    const candidate = req.headers.get("x-trenches-address") ?? "";
    if (secret === process.env.DEMO_SECRET && ADDRESS_RE.test(candidate)) return candidate.toLowerCase() as Address;
  }
  throw new ServiceError(401, "Sign in to continue.");
}
