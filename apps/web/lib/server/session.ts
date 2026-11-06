import type { Address } from "@trenches/core";
import { ServiceError } from "@trenches/services";
import type { NextRequest } from "next/server";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Who is calling a mutating route. Step 4 replaces the body with a Privy session check.
 * Until then (DEMO_MODE only) the caller states its address in the body or `x-trenches-address`.
 */
export async function requireAddress(req: NextRequest, body?: Record<string, unknown>): Promise<Address> {
  const candidate = (body?.adminAddress ?? body?.address ?? req.headers.get("x-trenches-address") ?? "") as string;
  if (process.env.DEMO_MODE !== "true") throw new ServiceError(401, "Sign in to continue.");
  if (!ADDRESS_RE.test(candidate)) throw new ServiceError(401, "Enter the host wallet address.", "adminAddress");
  return candidate.toLowerCase() as Address;
}
