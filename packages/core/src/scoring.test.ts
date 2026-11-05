import { describe, it, expect } from "vitest";
import { computeLeaderboard, rankChanges } from "./scoring.js";
import { trench, entries, fill, A, B, C, WETH, ZOLT, DOGE } from "../__fixtures__/fills.js";

const at = "2026-11-06T11:00:00.000Z";
const base = { trench, entries, computedAt: at };

describe("computeLeaderboard", () => {
  it("empty entrant ranks with zeros", () => {
    const rows = computeLeaderboard({ ...base, fills: [], markPrices: {} });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.pnlUsd)).toEqual([0, 0, 0]);
    // all tied at 0 pnl / 0 volume → earlier joinedAt first
    expect(rows.map((r) => r.trader)).toEqual([A, B, C]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("single round trip profit", () => {
    const fills = [
      fill({ trader: A, asset: WETH, side: "buy", qty: 1, priceUsd: 2000 }),
      fill({ trader: A, asset: WETH, side: "sell", qty: 1, priceUsd: 2100 }),
    ];
    const [top] = computeLeaderboard({ ...base, fills, markPrices: {} });
    expect(top!.trader).toBe(A);
    expect(top!.pnlUsd).toBe(100);
    expect(top!.volumeUsd).toBe(4100);
    expect(top!.winRate).toBe(1);
    expect(top!.fills).toBe(2);
    expect(top!.roiPct).toBe(5); // 100 / 2000 peak capital
  });

  it("single round trip loss with fee subtracted", () => {
    const fills = [
      fill({ trader: B, asset: ZOLT, side: "buy", qty: 100, priceUsd: 1, feeUsd: 0.3 }),
      fill({ trader: B, asset: ZOLT, side: "sell", qty: 100, priceUsd: 0.9, feeUsd: 0.27 }),
    ];
    const rows = computeLeaderboard({ ...base, fills, markPrices: {} });
    const b = rows.find((r) => r.trader === B)!;
    expect(b.pnlUsd).toBeCloseTo(-10.57, 6);
    expect(b.winRate).toBe(0);
    expect(b.rank).toBe(3); // below the two zero-pnl entrants
  });

  it("open position marked at the given price; falls back to last fill price", () => {
    const fills = [
      fill({ trader: A, asset: WETH, side: "buy", qty: 2, priceUsd: 2000 }),
      fill({ trader: B, asset: ZOLT, side: "buy", qty: 10, priceUsd: 1 }),
    ];
    const rows = computeLeaderboard({ ...base, fills, markPrices: { [WETH.toUpperCase()]: 2050 } });
    const a = rows.find((r) => r.trader === A)!;
    const b = rows.find((r) => r.trader === B)!;
    expect(a.pnlUsd).toBe(100); // 2 × (2050 − 2000), case-insensitive mark lookup
    expect(a.roiPct).toBe(2.5); // 100 / 4000
    expect(b.pnlUsd).toBe(0); // marked at last fill price
    expect(a.winRate).toBe(0); // nothing closed yet
  });

  it("partial fills use average cost and close the trip at zero", () => {
    const fills = [
      fill({ trader: A, asset: WETH, side: "buy", qty: 1, priceUsd: 2000 }),
      fill({ trader: A, asset: WETH, side: "buy", qty: 1, priceUsd: 2200 }), // avg 2100
      fill({ trader: A, asset: WETH, side: "sell", qty: 0.5, priceUsd: 2300 }), // +100
      fill({ trader: A, asset: WETH, side: "sell", qty: 1.5, priceUsd: 2000 }), // −150
    ];
    const rows = computeLeaderboard({ ...base, fills, markPrices: {} });
    const a = rows.find((r) => r.trader === A);
    expect(a!.rank).toBe(3); // a loss ranks below the two zero-P&L entrants
    expect(a!.pnlUsd).toBe(-50);
    expect(a!.winRate).toBe(0); // one closed trip, net negative
    expect(a!.roiPct).toBeCloseTo((-50 / 4200) * 100, 6);
  });

  it("ties on pnl are broken by lower volume", () => {
    const fills = [
      fill({ trader: A, asset: WETH, side: "buy", qty: 1, priceUsd: 2000 }),
      fill({ trader: A, asset: WETH, side: "sell", qty: 1, priceUsd: 2100 }), // +100, vol 4100
      fill({ trader: B, asset: ZOLT, side: "buy", qty: 100, priceUsd: 1 }),
      fill({ trader: B, asset: ZOLT, side: "sell", qty: 100, priceUsd: 2 }), // +100, vol 300
    ];
    const rows = computeLeaderboard({ ...base, fills, markPrices: {} });
    expect(rows[0]!.trader).toBe(B);
    expect(rows[1]!.trader).toBe(A);
    expect(rows[0]!.rank).toBe(1);
  });

  it("excludes fills outside the window, on disallowed assets, and from non-entrants", () => {
    const fills = [
      fill({ trader: A, asset: WETH, side: "buy", qty: 1, priceUsd: 1000, filledAt: "2026-11-06T09:59:59.000Z" }),
      fill({ trader: A, asset: DOGE, side: "buy", qty: 1, priceUsd: 1000 }),
      fill({ trader: "0xdddddddddddddddddddddddddddddddddddddddd", asset: WETH, side: "buy", qty: 1, priceUsd: 1000 }),
      fill({ trader: A, asset: WETH, side: "sell", qty: 1, priceUsd: 5000, filledAt: "2026-11-06T12:00:00.001Z" }),
    ];
    const rows = computeLeaderboard({ ...base, fills, markPrices: { [WETH]: 9999 } });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.pnlUsd === 0 && r.fills === 0)).toBe(true);
  });

  it("sell beyond held qty does not create a short", () => {
    const fills = [fill({ trader: A, asset: WETH, side: "sell", qty: 1, priceUsd: 2000 })];
    const rows = computeLeaderboard({ ...base, fills, markPrices: { [WETH]: 1000 } });
    const a = rows.find((r) => r.trader === A)!;
    expect(a.pnlUsd).toBe(0);
    expect(a.volumeUsd).toBe(2000);
  });

  it("is deterministic regardless of input order", () => {
    const fills = [
      fill({ trader: A, asset: WETH, side: "buy", qty: 1, priceUsd: 2000 }),
      fill({ trader: A, asset: WETH, side: "sell", qty: 1, priceUsd: 2100 }),
      fill({ trader: B, asset: ZOLT, side: "buy", qty: 10, priceUsd: 1 }),
    ];
    const r1 = computeLeaderboard({ ...base, fills, markPrices: { [ZOLT]: 1.5 } });
    const r2 = computeLeaderboard({ ...base, fills: [...fills].reverse(), entries: [...entries].reverse(), markPrices: { [ZOLT]: 1.5 } });
    expect(r1).toEqual(r2);
  });
});

describe("rankChanges", () => {
  it("reports moved and new traders only", () => {
    const prev = [{ trader: A, rank: 1 }, { trader: B, rank: 2 }];
    const next = [{ trader: B, rank: 1 }, { trader: A, rank: 2 }, { trader: C, rank: 3 }];
    expect(rankChanges(prev, next)).toEqual([
      { trader: B, from: 2, to: 1 },
      { trader: A, from: 1, to: 2 },
      { trader: C, from: null, to: 3 },
    ]);
    expect(rankChanges(next, next)).toEqual([]);
  });
});
