import { describe, it, expect } from "vitest";
import { slugify, newInviteCode, newId } from "./ids.js";

describe("ids", () => {
  it("slugifies with a suffix", () => {
    expect(slugify("ETH Week Trench", "k3x9")).toBe("eth-week-trench-k3x9");
    expect(slugify("  !!! ", "ab12")).toBe("trench-ab12");
    expect(slugify("x".repeat(80), "zzzz").length).toBeLessThanOrEqual(45);
  });
  it("invite codes are 8 url-safe chars", () => {
    expect(newInviteCode()).toMatch(/^[A-Za-z0-9]{8}$/);
  });
  it("ulids are 26 chars", () => {
    expect(newId()).toHaveLength(26);
  });
});
