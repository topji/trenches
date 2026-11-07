import { expect, test } from "@playwright/test";
import { demoSession } from "./helpers";

/**
 * F4 Live leaderboard. F4.1 reads the real board of the Flash gate Trench (scored from live Flash fills)
 * logged out, straight from Arkiv. F4.2 drives the polling client with a scripted leaderboard response
 * so the rank-change highlight and the polite live region are deterministic.
 */
const GATE_SLUG = "flash-gate-trench-1syb";
const GATE_ID = "01M6SEX2Q1PQD42NG4MNY4TMVR";
const TRADER = "0xd3ad26714e5ef9583d9b441146e14a8e3913d00c";
const OTHER = "0x9999999999999999999999999999999999999999";

test("F4.1 logged out: the board renders from the Arkiv query with real P&L", async ({ page, request }) => {
  const api = await request.get(`/api/trenches/${GATE_ID}/leaderboard`);
  expect(api.ok()).toBe(true);
  const body = (await api.json()) as { rows: { trader: string; rank: number; pnlUsd: number; fills: number }[]; source: string };
  expect(body.source).toBe("arkiv");
  const mine = body.rows.find((r) => r.trader.toLowerCase() === TRADER);
  expect(mine?.rank).toBe(1);
  expect(mine?.fills).toBeGreaterThanOrEqual(5);
  expect(mine?.pnlUsd).not.toBe(0);

  await page.goto(`/t/${GATE_SLUG}`);
  const row = page.getByRole("region", { name: "Leaderboard" }).getByRole("row").filter({ hasText: "0xd3ad…d00c" }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText(/[+−]\$\d/); // signed P&L with explicit sign
  await expect(row.getByLabel("Verified unique human (World ID)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Join this season" })).toBeVisible(); // logged out: no "You" tag
  await expect(row.getByText("You")).toHaveCount(0);
});

test("F4.2 rank change highlights the moved rows and announces the caller's new rank", async ({ page }) => {
  await demoSession(page, TRADER);
  const mk = (ranks: [string, number][]) => ({
    rows: ranks.map(([trader, rank]) => ({ trader, rank, pnlUsd: rank === 1 ? 1.5 : -0.5, roiPct: 0, volumeUsd: 10, winRate: null, fills: 1 })),
    computedAt: new Date().toISOString(),
    source: "arkiv",
  });
  let calls = 0;
  await page.route(`**/api/trenches/${GATE_ID}/leaderboard`, (route) => {
    calls += 1;
    // first poll: TRADER #1, OTHER #2 → second poll: swapped
    const body = calls === 1 ? mk([[TRADER, 1], [OTHER, 2]]) : mk([[OTHER, 1], [TRADER, 2]]);
    void route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.clock.install();
  await page.goto(`/t/${GATE_SLUG}`);
  const board = page.getByRole("region", { name: "Leaderboard" });
  await expect(board.getByRole("row").filter({ hasText: "0xd3ad…d00c" }).first()).toBeVisible();

  await page.clock.runFor(15_500); // poll 1: establishes ranks TRADER=1
  await expect(board.getByRole("row").filter({ hasText: "0x9999…9999" })).toBeVisible();
  await page.clock.runFor(15_500); // poll 2: swap → both rows flash, live region speaks
  const mine = board.getByRole("row").filter({ hasText: "0xd3ad…d00c" }).first();
  await expect(mine).toHaveClass(/rank-flash/);
  await expect(mine).toContainText("2");
  await expect(page.getByRole("status")).toHaveText("You moved to rank 2.");
  await page.clock.runFor(2_000);
  await expect(mine).not.toHaveClass(/rank-flash/);
});
