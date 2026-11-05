import { describe, it, expect } from "vitest";
import { platformFeeUsd, splitFee } from "./fees.js";

describe("fees", () => {
  it("30 bps of $3 is $0.009", () => {
    expect(platformFeeUsd(3)).toBe(0.009);
    expect(platformFeeUsd(1000, 30)).toBe(3);
  });
  it("splits 50/50 by default and sums back", () => {
    expect(splitFee(0.009)).toEqual({ platformUsd: 0.0045, adminUsd: 0.0045 });
    const s = splitFee(1.234567, 2500);
    expect(s.adminUsd + s.platformUsd).toBeCloseTo(1.234567, 6);
    expect(s.adminUsd).toBeCloseTo(0.308642, 6);
  });
  it("rejects out-of-range share", () => {
    expect(() => splitFee(1, 10_001)).toThrow();
  });
});
