import { describe, expect, it } from "vitest";
import { clanSeasonScore, levelFor, rankClans, xpFor, seasonOf } from "./clans.js";

describe("xp + levels", () => {
  it("counts volume, podiums and clan membership", () => {
    expect(xpFor({ volumeUsd: 0, podiumRanks: [], inClan: false })).toBe(0);
    expect(xpFor({ volumeUsd: 1234, podiumRanks: [1, 3], inClan: true })).toBe(12 + 100 + 40 + 25);
    expect(xpFor({ volumeUsd: 99, podiumRanks: [4], inClan: false })).toBe(0);
  });
  it("maps xp to level thresholds", () => {
    expect(levelFor(0)).toMatchObject({ level: 1, title: "Recruit", nextXp: 200, progress: 0 });
    expect(levelFor(199).level).toBe(1);
    expect(levelFor(200)).toMatchObject({ level: 2, title: "Grunt" });
    expect(levelFor(600).title).toBe("Veteran");
    expect(levelFor(1500).title).toBe("Captain");
    expect(levelFor(4000)).toMatchObject({ level: 5, title: "Warlord", nextXp: null, progress: 1 });
    expect(levelFor(400).progress).toBeCloseTo(0.5);
  });
});

describe("clan score", () => {
  it("clamps member ROI to ±50 and adds 20 per podium", () => {
    const r = clanSeasonScore([
      { trader: "a", roiPct: 120, podiums: 1 }, // clamped to 50 + 20
      { trader: "b", roiPct: -80, podiums: 0 }, // clamped to −50
      { trader: "c", roiPct: 12.5, podiums: 2 }, // 12.5 + 40
    ]);
    expect(r).toEqual({ score: 72.5, podiums: 3 });
  });
  it("ranks by score, then fewer members", () => {
    const rows = rankClans([
      { id: "x", score: 10, members: 5, createdAt: "2026-11-01T00:00:00Z" },
      { id: "y", score: 10, members: 2, createdAt: "2026-11-02T00:00:00Z" },
      { id: "z", score: 30, members: 50, createdAt: "2026-11-03T00:00:00Z" },
    ]);
    expect(rows.map((r) => [r.id, r.rank])).toEqual([["z", 1], ["y", 2], ["x", 3]]);
  });
  it("season is the UTC month", () => {
    expect(seasonOf(new Date("2026-11-07T00:00:00Z"))).toBe("2026-11");
  });
});
