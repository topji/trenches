import { describe, it, expect } from "vitest";
import { encodeJson, decodeJson, isoToU64, u64ToIso, toDec } from "./codec.js";
import { lifetimeBlocksUntil, MAX_LIFETIME_BLOCKS } from "./expiry.js";
import { trenchToValues, lbToValues, lbFromRow, statusFilter } from "./repo.js";
import type { Trench, LeaderboardRow } from "@trenches/core";
import { bytesToHex } from "viem";

const secs = (iso: string) => BigInt(Date.parse(iso) / 1000);

const trench: Trench = {
  id: "01TRENCH", slug: "eth-week-abcd", name: "ETH Week Trench", description: "", adminAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  startAt: "2026-11-06T10:00:00.000Z", endAt: "2026-11-06T12:00:00.000Z",
  allowedAssets: [{ chainId: 8453, address: "0x4200000000000000000000000000000000000006", symbol: "weth" }],
  prizePoolUsdc: 300, prizeSplit: [50, 30, 20], entryRule: "open", adminFeeShareBps: 5000, status: "draft",
  hedera: { escrowAccountId: "0.0.1", topicId: "0.0.2" }, createdAt: "2026-11-05T10:00:00.000Z",
};

describe("codec", () => {
  it("round-trips JSON through bytes", () => {
    expect(decodeJson<Trench>(bytesToHex(encodeJson(trench)))).toEqual(trench);
  });
  it("converts timestamps to u64 seconds and back", () => {
    expect(isoToU64("2026-11-06T10:00:00.000Z")).toBe(secs("2026-11-06T10:00:00.000Z"));
    expect(u64ToIso(secs("2026-11-06T10:00:00.000Z"))).toBe("2026-11-06T10:00:00.000Z");
    expect(() => isoToU64("nope")).toThrow();
  });
  it("formats decimals without trailing zeros", () => {
    expect(toDec(300)).toBe("300");
    expect(toDec(-10.57)).toBe("-10.57");
    expect(toDec(0)).toBe("0");
    expect(toDec(0.1234567)).toBe("0.123457");
  });
});

describe("expiry", () => {
  const now = new Date("2026-11-05T10:00:00.000Z");
  it("is end + 30 days from now in 2 s blocks", () => {
    // end is 26 h away; + 30 d = 2,685,600 s → 1,342,800 blocks
    expect(lifetimeBlocksUntil("2026-11-06T12:00:00.000Z", now)).toBe(1_342_800n);
  });
  it("floors at one day and caps at the max lifetime", () => {
    expect(lifetimeBlocksUntil("2020-01-01T00:00:00.000Z", now)).toBe(43_200n);
    expect(lifetimeBlocksUntil("2027-12-01T00:00:00.000Z", now)).toBe(MAX_LIFETIME_BLOCKS);
  });
});

describe("mappers", () => {
  it("maps a Trench to indexed columns", () => {
    const v = trenchToValues(trench);
    expect(v.asset1).toBe("WETH");
    expect(v).not.toHaveProperty("asset2");
    expect(v.status).toBe("draft");
    expect(decodeJson<Trench>(bytesToHex(v.payload))).toEqual(trench);
  });
  it("round-trips a leaderboard row", () => {
    const row: LeaderboardRow = { trenchId: "01TRENCH", trader: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", rank: 2, pnlUsd: 12.5, roiPct: 3.1, volumeUsd: 400, winRate: 0.5, fills: 4, computedAt: "2026-11-06T11:00:00.000Z" };
    const v = lbToValues(row);
    const back = lbFromRow({
      trenchId: { value: v.trenchId }, trader: { value: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" }, rank: { value: v.rank },
      pnlUsd: { value: "12.5" }, roiPct: { value: "3.1" }, volumeUsd: { value: "400" }, winRate: { value: "0.5" }, fills: { value: 4 }, computedAt: { value: secs("2026-11-06T11:00:00.000Z") },
    });
    expect(back).toEqual({ ...row, trader: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" });
  });
  it("builds OR filters for multiple statuses", () => {
    expect(String(statusFilter(["funded", "live"]))).toMatch(/status = str\('funded'\)/);
    expect(String(statusFilter(["funded", "live"]))).toMatch(/OR/);
  });
});
