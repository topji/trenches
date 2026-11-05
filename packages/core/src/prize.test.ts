import { describe, it, expect } from "vitest";
import { splitPrize, splitPrizeUsdc, isValidPrizeSplit } from "./prize.js";
import { toBaseUnits, fromBaseUnits } from "./money.js";

describe("splitPrize", () => {
  it("splits 300 USDC 50/30/20 exactly", () => {
    expect(splitPrizeUsdc(300, [50, 30, 20], 3)).toEqual([150, 90, 60]);
  });
  it("sends the rounding remainder to rank 1 and sums to the pool", () => {
    const pool = toBaseUnits("100.000001");
    const out = splitPrize(pool, [33, 33, 34], 3);
    expect(out.reduce((a, b) => a + b, 0n)).toBe(pool);
    expect(fromBaseUnits(out[0]!)).toBe("33.000001");
    expect(fromBaseUnits(out[1]!)).toBe("33.000000");
    expect(fromBaseUnits(out[2]!)).toBe("34.000000");
  });
  it("gives unfilled places to rank 1 when there are fewer winners than places", () => {
    expect(splitPrizeUsdc(300, [50, 30, 20], 2)).toEqual([210, 90]);
    expect(splitPrizeUsdc(300, [50, 30, 20], 1)).toEqual([300]);
  });
  it("returns nothing for zero winners", () => {
    expect(splitPrize(1_000_000n, [50, 30, 20], 0)).toEqual([]);
  });
});

describe("isValidPrizeSplit", () => {
  it("accepts splits that sum to 100 with ≤5 places", () => {
    expect(isValidPrizeSplit([50, 30, 20])).toBe(true);
    expect(isValidPrizeSplit([100])).toBe(true);
    expect(isValidPrizeSplit([40, 30, 20, 10])).toBe(true);
  });
  it("rejects bad splits", () => {
    expect(isValidPrizeSplit([50, 30])).toBe(false);
    expect(isValidPrizeSplit([50.5, 49.5])).toBe(false);
    expect(isValidPrizeSplit([])).toBe(false);
    expect(isValidPrizeSplit([20, 20, 20, 20, 10, 10])).toBe(false);
  });
});

describe("money", () => {
  it("round-trips base units", () => {
    expect(toBaseUnits("300")).toBe(300_000_000n);
    expect(toBaseUnits(2.5)).toBe(2_500_000n);
    expect(toBaseUnits("0.1234567")).toBe(123_456n);
    expect(fromBaseUnits(123_456n)).toBe("0.123456");
    expect(fromBaseUnits(-1_500_000n)).toBe("-1.500000");
  });
  it("rejects garbage", () => {
    expect(() => toBaseUnits("abc")).toThrow();
  });
});
