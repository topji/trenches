import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { ACCEPTED_IDENTIFIERS, idkitResultSchema, verifyErrorSchema, verifySuccessSchema, type IdKitResult } from "./schemas.js";
import { canonicalNullifier } from "./nullifier.js";
import type { NonceStore } from "./rp.js";

export const WORLD_VERIFY_BASE = "https://developer.world.org";

export interface VerifyOptions {
  rpId: string;
  expectedAction: string;
  expectedEnvironment: "production" | "staging" | "sandbox";
  expectedSignal: string;
  /** When set, results must carry a nonce this server issued (single use). In-memory or DB-backed. */
  nonces?: NonceStore;
  /**
   * WORLD_MOCK=true (hackathon): skip the Developer Portal call and accept a well-formed result that
   * carries a server-issued nonce, matching action, environment and signal hash. Never accepts an
   * unsolicited payload. State this in the README.
   */
  mock?: boolean;
  fetch?: typeof fetch;
  baseUrl?: string;
}

export type VerifyOutcome =
  | { ok: true; nullifier: string; identifier: string; protocolVersion: "3.0" | "4.0"; mocked: boolean }
  | { ok: false; status: 400 | 401 | 502; code: string; detail: string };

function fail(status: 400 | 401 | 502, code: string, detail: string): VerifyOutcome {
  return { ok: false, status, code, detail };
}

/** docs/integrations/world.md §4.1 — forward the result unchanged, then enforce our own checks. */
export async function verifyIdKitResult(raw: unknown, opts: VerifyOptions): Promise<VerifyOutcome> {
  const parsed = idkitResultSchema.safeParse(raw);
  if (!parsed.success) return fail(400, "malformed_result", "IDKit result did not match the expected shape.");
  const result: IdKitResult = parsed.data;

  if (result.environment !== opts.expectedEnvironment) return fail(401, "environment_mismatch", `Proof environment ${result.environment} ≠ ${opts.expectedEnvironment}.`);
  if (result.protocol_version === "4.0" && result.action !== opts.expectedAction) return fail(401, "action_mismatch", "Proof action does not match.");
  if (result.protocol_version === "3.0" && result.action && result.action !== opts.expectedAction) return fail(401, "action_mismatch", "Proof action does not match.");

  const item = result.responses.find((r) => ACCEPTED_IDENTIFIERS.has(r.identifier)) ?? result.responses[0]!;
  if (!ACCEPTED_IDENTIFIERS.has(item.identifier)) return fail(401, "credential_not_accepted", `Credential ${item.identifier} is not Proof of Human.`);

  const expectedHash = hashSignal(opts.expectedSignal).toLowerCase();
  if ((item.signal_hash ?? "").toLowerCase() !== expectedHash) return fail(401, "signal_mismatch", "Proof was not issued for this Trench and wallet.");

  if (opts.nonces && !(await opts.nonces.consume(result.nonce, opts.expectedAction))) return fail(401, "unknown_nonce", "Proof request was not issued by this server or has expired.");

  let nullifier: string;
  try {
    nullifier = canonicalNullifier(item.nullifier);
  } catch {
    return fail(400, "malformed_result", "Bad nullifier.");
  }

  if (opts.mock) {
    return { ok: true, nullifier, identifier: item.identifier, protocolVersion: result.protocol_version, mocked: true };
  }

  const f = opts.fetch ?? fetch;
  let res: Response;
  try {
    res = await f(`${(opts.baseUrl ?? WORLD_VERIFY_BASE).replace(/\/$/, "")}/api/v4/verify/${opts.rpId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...result, environment: opts.expectedEnvironment }),
    });
  } catch (e) {
    return fail(502, "world_unreachable", `Couldn't reach World: ${(e as Error).message}`);
  }
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = verifyErrorSchema.safeParse(body);
    return fail(401, err.success ? err.data.code : `http_${res.status}`, err.success ? err.data.detail : "Verification failed.");
  }
  const ok = verifySuccessSchema.safeParse(body);
  if (!ok.success || ok.data.success !== true) return fail(401, "verification_failed", "World did not confirm the proof.");
  if (ok.data.environment && ok.data.environment !== opts.expectedEnvironment) return fail(401, "environment_mismatch", "World reported a different environment.");

  return { ok: true, nullifier, identifier: item.identifier, protocolVersion: result.protocol_version, mocked: false };
}
