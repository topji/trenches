import { expect, test } from "@playwright/test";
import { createTrenchViaApi, demoHeaders, demoSession, joinViaApi, waitForStatus, type CreatedTrench } from "./helpers";

/**
 * F5 Prize escrow and payout. A fresh Trench with two entrants is fast-forwarded (DEMO_MODE) and settled:
 * final HCS message, escrow → winners HTS transfer per prizeSplit, payout entities on Arkiv, settled page.
 * Winners' Hedera accounts are created by the platform for the demo (DEMO_WINNER_ACCOUNTS is empty).
 */
const ADMIN = "0xE5B3DB4a3D4F88C21CF85492222c8B4dDcdc1e87";
const A = "0x6666666666666666666666666666666666666666";
const B = "0x7777777777777777777777777777777777777777";

let t: CreatedTrench;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  test.setTimeout(480_000);
  t = await createTrenchViaApi(request, ADMIN, { name: `F5 settle ${Date.now().toString(36)}`, startInMs: -60_000, durationMs: 30 * 60_000, fund: true });
  await request.post("/api/dev/tick", { data: { trenchId: t.id } });
  await waitForStatus(request, t.id, "live");
});

async function join(page: import("@playwright/test").Page, who: string, slug: string) {
  await demoSession(page, who);
  await page.goto(`/t/${slug}`);
  await page.getByRole("button", { name: "Join this Trench" }).click();
  await page.getByRole("button", { name: "Verify as human" }).click({ timeout: 60_000 });
  await expect(page.getByText("You're in. Place your first order.")).toBeVisible({ timeout: 120_000 });
}

test("F5.1 fast-forward settles: final HCS, escrow pays winners per split, payout entities, settled page", async ({ page, request }, testInfo) => {
  test.slow();
  await join(page, A, t.slug); // through the UI
  await joinViaApi(request, t.id, B); // through the API (same server path)

  const ff = await request.post("/api/dev/fast-forward", { headers: demoHeaders(ADMIN), data: { trenchId: t.id } });
  expect(ff.ok()).toBe(true);
  const body = (await ff.json()) as {
    ended: boolean;
    settlement: { winners: { rank: number; trader: string; amountUsdc: number; accountId: string }[]; payoutTxId: string | null; finalMsg: { txId?: string }; paidMsg: { txId?: string } | null; arkivPayoutsTx?: string; feeShare: { amountUsdc: number; scheduleId: string | null } };
  };
  expect(body.ended).toBe(true);
  const s = body.settlement;
  expect(s.payoutTxId).toBeTruthy();
  expect(s.finalMsg.txId).toBeTruthy();
  expect(s.paidMsg?.txId).toBeTruthy();
  expect(s.arkivPayoutsTx).toBeTruthy();
  // two entrants, split [50,30,20]: rank 1 gets 50 + unfilled 20 = 0.70, rank 2 gets 0.30 (6 dp exact)
  expect(s.winners.map((w) => w.amountUsdc)).toEqual([0.7, 0.3]);
  expect(s.winners.map((w) => w.rank)).toEqual([1, 2]);
  expect(s.feeShare.amountUsdc).toBe(0); // no fills in this Trench → nothing to schedule

  await waitForStatus(request, t.id, "settled");
  const after = (await (await request.get(`/api/trenches/${t.id}`)).json()) as { hcs: { event: string }[]; links: { payoutTx: string | null } };
  expect(after.hcs.map((m) => m.event)).toEqual(expect.arrayContaining(["leaderboard.final", "trench.paid"]));
  expect(after.links.payoutTx).toMatch(/hashscan\.io\/testnet\/transaction\//);
  // F5.3: Mirror Node reconciles the escrow to zero (a few seconds of lag)
  await expect.poll(async () => ((await (await request.get(`/api/trenches/${t.id}`)).json()) as { escrowBalanceUsdc: number }).escrowBalanceUsdc, { timeout: 90_000 }).toBe(0);

  await page.goto(`/t/${t.slug}`);
  await expect(page.getByText(/Settled · paid \d\d:\d\d IST/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Payouts" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "$0.70" })).toHaveCount(1);
  await expect(page.getByRole("row").filter({ hasText: "$0.30" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: /Payout tx/ })).toHaveAttribute("href", /hashscan\.io\/testnet\/transaction\//);
  await expect(page.getByRole("heading", { name: "Final results" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("settled.png"), fullPage: true });
});

test("F5.4 no Solidity anywhere in the repo", async () => {
  const { execSync } = await import("node:child_process");
  const sol = execSync("find . -name '*.sol' -not -path '*/node_modules/*' | wc -l").toString().trim();
  expect(sol).toBe("0");
  const needle = ["pragma", "solidity"].join(" "); // not spelled out, or this file would match itself
  const pragma = execSync(`grep -rl '${needle}' --include='*.ts' --include='*.tsx' --include='*.js' . --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=e2e || true`).toString().trim();
  expect(pragma).toBe("");
});
