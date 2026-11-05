import { describe, it, expect } from "vitest";
import { createTrenchSchema } from "./validation.js";
import { WETH } from "../__fixtures__/fills.js";

const now = new Date("2026-11-06T10:00:00.000Z");
const valid = {
  name: "ETH Week Trench",
  description: "",
  startAt: "2026-11-06T10:10:00.000Z",
  endAt: "2026-11-06T12:00:00.000Z",
  allowedAssets: [{ chainId: 8453, address: WETH, symbol: "WETH" }],
  prizePoolUsdc: 300,
  prizeSplit: [50, 30, 20],
  entryRule: "open" as const,
  adminFeeShareBps: 5000,
};

function messages(input: unknown, demoMode = false) {
  const r = createTrenchSchema({ now, demoMode }).safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.message);
}

describe("createTrenchSchema", () => {
  it("accepts a valid form", () => {
    expect(messages(valid)).toEqual([]);
  });
  it("end must be after start", () => {
    expect(messages({ ...valid, endAt: valid.startAt })).toContain("End time must be after start time.");
  });
  it("prize split must sum to 100", () => {
    expect(messages({ ...valid, prizeSplit: [50, 30] })).toContain("Prize split adds up to 80%, needs 100%.");
  });
  it("needs at least one asset", () => {
    expect(messages({ ...valid, allowedAssets: [] })).toContain("Add at least one asset.");
  });
  it("start must be 5 minutes out unless demo mode", () => {
    const soon = { ...valid, startAt: "2026-11-06T10:01:00.000Z" };
    expect(messages(soon)).toContain("Start at least 5 minutes from now.");
    expect(messages(soon, true)).toEqual([]);
  });
  it("demo mode allows a 2-minute Trench", () => {
    const short = { ...valid, startAt: "2026-11-06T10:00:00.000Z", endAt: "2026-11-06T10:02:00.000Z" };
    expect(messages(short, true)).toEqual([]);
    expect(messages(short)).toContain("A Trench must run for at least 10 minutes.");
  });
});
