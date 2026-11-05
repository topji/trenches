import { describe, it, expect } from "vitest";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { verifyIdKitResult } from "./verify.js";
import { NonceRegistry, signRpContext } from "./rp.js";
import { canonicalNullifier, nullifierKey, joinSignal } from "./nullifier.js";
import { idkitResultSchema } from "./schemas.js";

const RP = "rp_test";
const KEY = "0x" + "11".repeat(32);
const action = "join-trench";
const signal = joinSignal("01T", "0xAbC");

function v4(overrides: Record<string, unknown> = {}, item: Record<string, unknown> = {}) {
  return {
    protocol_version: "4.0", nonce: "n1", action, environment: "staging",
    responses: [{ identifier: "proof_of_human", signal_hash: hashSignal(signal), proof: ["0x1", "0x2", "0x3", "0x4", "0x5"], nullifier: "0x04e5f6", issuer_schema_id: 1, expires_at_min: 1756166400, ...item }],
    ...overrides,
  };
}

const base = { rpId: RP, expectedAction: action, expectedEnvironment: "staging" as const, expectedSignal: signal };
const okResponse = () => new Response(JSON.stringify({ success: true, environment: "staging", results: [{ success: true }] }), { status: 200 });
const okFetch = (async () => okResponse()) as unknown as typeof fetch;
const badFetch = (async () => new Response(JSON.stringify({ success: false, code: "all_verifications_failed", detail: "All proof verifications failed." }), { status: 400 })) as unknown as typeof fetch;

describe("schemas", () => {
  it("parses the docs' 4.0 and 3.0 examples", () => {
    expect(idkitResultSchema.parse(v4()).protocol_version).toBe("4.0");
    const v3 = { protocol_version: "3.0", nonce: "n", action, environment: "production", responses: [{ identifier: "orb", signal_hash: "0x00c5", proof: "0x1a", merkle_root: "0x0a", nullifier: "0x04" }] };
    expect(idkitResultSchema.parse(v3).protocol_version).toBe("3.0");
  });
});

describe("verifyIdKitResult", () => {
  it("accepts a verified proof and canonicalises the nullifier", async () => {
    const r = await verifyIdKitResult(v4(), { ...base, fetch: okFetch });
    expect(r).toMatchObject({ ok: true, nullifier: BigInt("0x04e5f6").toString(), identifier: "proof_of_human", mocked: false });
  });
  it("forwards the result unchanged (plus environment)", async () => {
    let sent: unknown;
    const spy = (async (_u: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return okResponse(); }) as unknown as typeof fetch;
    await verifyIdKitResult(v4(), { ...base, fetch: spy });
    expect(sent).toMatchObject({ protocol_version: "4.0", nonce: "n1", environment: "staging" });
  });
  it("rejects when World says no", async () => {
    expect(await verifyIdKitResult(v4(), { ...base, fetch: badFetch })).toMatchObject({ ok: false, status: 401, code: "all_verifications_failed" });
  });
  it("rejects environment, action, signal and credential mismatches before calling World", async () => {
    const neverFetch = (async () => { throw new Error("should not call"); }) as unknown as typeof fetch;
    expect(await verifyIdKitResult(v4({ environment: "production" }), { ...base, fetch: neverFetch })).toMatchObject({ ok: false, code: "environment_mismatch" });
    expect(await verifyIdKitResult(v4({ action: "other" }), { ...base, fetch: neverFetch })).toMatchObject({ ok: false, code: "action_mismatch" });
    expect(await verifyIdKitResult(v4({}, { signal_hash: hashSignal("x") }), { ...base, fetch: neverFetch })).toMatchObject({ ok: false, code: "signal_mismatch" });
    expect(await verifyIdKitResult(v4({}, { identifier: "passport" }), { ...base, fetch: neverFetch })).toMatchObject({ ok: false, code: "credential_not_accepted" });
    expect(await verifyIdKitResult({ nope: 1 }, { ...base, fetch: neverFetch })).toMatchObject({ ok: false, status: 400 });
  });
  it("mock mode only accepts a nonce this server issued, once", async () => {
    const nonces = new NonceRegistry();
    const ctx = signRpContext({ rpId: RP, signingKeyHex: KEY, action });
    nonces.issue(ctx, action);
    const neverFetch = (async () => { throw new Error("should not call"); }) as unknown as typeof fetch;
    expect(await verifyIdKitResult(v4({ nonce: "stranger" }), { ...base, mock: true, nonces, fetch: neverFetch })).toMatchObject({ ok: false, code: "unknown_nonce" });
    expect(await verifyIdKitResult(v4({ nonce: ctx.nonce }), { ...base, mock: true, nonces, fetch: neverFetch })).toMatchObject({ ok: true, mocked: true });
    expect(await verifyIdKitResult(v4({ nonce: ctx.nonce }), { ...base, mock: true, nonces, fetch: neverFetch })).toMatchObject({ ok: false, code: "unknown_nonce" });
  });
});

describe("rp + nullifier helpers", () => {
  it("signs an rp_context with the expected fields", () => {
    const ctx = signRpContext({ rpId: RP, signingKeyHex: KEY, action, ttl: 300 });
    expect(ctx.rp_id).toBe(RP);
    expect(ctx.expires_at - ctx.created_at).toBe(300);
    expect(ctx.signature).toMatch(/^0x[0-9a-f]+$/i);
    expect(ctx.nonce.length).toBeGreaterThan(10);
  });
  it("hashes nullifiers with the salt, deterministic across hex/decimal forms", () => {
    expect(canonicalNullifier("0xff")).toBe("255");
    expect(nullifierKey("0xff", "salt")).toBe(nullifierKey("255", "salt"));
    expect(nullifierKey("0xff", "salt")).not.toBe(nullifierKey("0xff", "other"));
    expect(() => nullifierKey("0xff", "")).toThrow();
  });
});
