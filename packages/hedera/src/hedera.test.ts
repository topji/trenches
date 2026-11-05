import { describe, it, expect } from "vitest";
import { toMirrorTxId, hashscan, isScheduledTxId } from "./ids.js";
import { encryptSecret, decryptSecret, parsePrivateKey, generateEscrowKey } from "./keys.js";
import { buildMessage, HCS_MAX_BYTES } from "./topics.js";
import { MirrorNode } from "./mirror.js";

describe("ids", () => {
  it("converts SDK ids to mirror form, stripping scheduled/nonce suffixes", () => {
    expect(toMirrorTxId("0.0.123@1699999999.123456789")).toBe("0.0.123-1699999999-123456789");
    expect(toMirrorTxId("0.0.123@1699999999.123456789?scheduled")).toBe("0.0.123-1699999999-123456789");
    expect(toMirrorTxId("0.0.2252@1640075693.891386528/1")).toBe("0.0.2252-1640075693-891386528");
    expect(toMirrorTxId("0.0.123-1699999999-123456789")).toBe("0.0.123-1699999999-123456789");
    expect(isScheduledTxId("0.0.1@2.3?scheduled")).toBe(true);
  });
  it("builds HashScan links", () => {
    const h = hashscan("testnet");
    expect(h.tx("0.0.123@1699999999.123456789")).toBe("https://hashscan.io/testnet/transaction/0.0.123-1699999999-123456789");
    expect(h.topic("0.0.5")).toBe("https://hashscan.io/testnet/topic/0.0.5");
    expect(h.schedule("0.0.6")).toBe("https://hashscan.io/testnet/schedule/0.0.6");
  });
});

describe("keys", () => {
  it("round-trips an escrow key through AES-256-GCM", () => {
    const k = generateEscrowKey();
    const der = k.toStringDer();
    const blob = encryptSecret(der, "a-very-long-secret-for-tests");
    expect(blob.startsWith("v1:")).toBe(true);
    expect(decryptSecret(blob, "a-very-long-secret-for-tests")).toBe(der);
    expect(() => decryptSecret(blob, "wrong-secret-wrong-secret")).toThrow();
  });
  it("parses DER and raw ECDSA keys to the same type", () => {
    const k = generateEscrowKey();
    expect(parsePrivateKey(k.toStringDer()).toStringDer()).toBe(k.toStringDer());
    expect(parsePrivateKey(k.toStringRaw(), "ECDSA").toStringDer()).toBe(k.toStringDer());
    expect(parsePrivateKey(k.toStringRaw()).toStringDer()).toBe(k.toStringDer()); // raw defaults to ECDSA
  });
});

describe("hcs messages", () => {
  it("wraps payloads in the v1 envelope and enforces 1 KB", () => {
    const m = JSON.parse(buildMessage("trench.created", "T1", { a: 1 }, "2026-11-05T10:00:00.000Z"));
    expect(m).toEqual({ v: 1, event: "trench.created", trenchId: "T1", at: "2026-11-05T10:00:00.000Z", payload: { a: 1 } });
    expect(() => buildMessage("x", "T1", { big: "y".repeat(HCS_MAX_BYTES) })).toThrow(/bytes/);
  });
});

describe("mirror", () => {
  it("parses account token balances and topic messages", async () => {
    const fetchImpl = (async (url: string) => {
      if (String(url).includes("/accounts/")) return new Response(JSON.stringify({ account: "0.0.5", balance: { balance: 100, timestamp: "1.0", tokens: [{ token_id: "0.0.429274", balance: 55699998 }] } }));
      if (String(url).includes("/messages")) return new Response(JSON.stringify({ messages: [{ consensus_timestamp: "1.0", message: Buffer.from('{"v":1}').toString("base64"), sequence_number: 7, topic_id: "0.0.9" }], links: { next: null } }));
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;
    const m = new MirrorNode("testnet", fetchImpl);
    expect(await m.tokenBalance("0.0.5", "0.0.429274")).toBe(55699998n);
    expect(await m.tokenBalance("0.0.5", "0.0.1")).toBe(0n);
    expect(await m.topicMessages("0.0.9")).toEqual([{ sequenceNumber: 7, consensusTimestamp: "1.0", text: '{"v":1}' }]);
    expect(await m.transaction("0.0.1@1.2")).toBeNull();
  });
});
