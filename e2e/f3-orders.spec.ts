import { expect, test } from "@playwright/test";
import { createTrenchViaApi, demoHeaders, demoSession, type CreatedTrench } from "./helpers";

/**
 * F3 Trade inside the Trench — the API guards (F3.3) and the ticket UI, against live Flash quotes.
 * F3.1 (a real fill) needs a funded wallet signing in the browser and is run manually; see PROGRESS.md.
 */
const ADMIN = "0xE5B3DB4a3D4F88C21CF85492222c8B4dDcdc1e87";
const TRADER = "0x4444444444444444444444444444444444444444";
const OUTSIDER = "0x5555555555555555555555555555555555555555";
const WETH = "0x4200000000000000000000000000000000000006";
const DEGEN = "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed";

let live: CreatedTrench;
let upcoming: CreatedTrench;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  test.setTimeout(240_000);
  const tag = Date.now().toString(36);
  // Starts in the past (demo mode allows it) so one worker tick makes it live.
  live = await createTrenchViaApi(request, ADMIN, { name: `F3 live ${tag}`, startInMs: -60_000, durationMs: 30 * 60_000, fund: true });
  const tick = await request.post("/api/dev/tick", { data: {} });
  const body = (await tick.json()) as { transitions: { trenchId: string; to: string }[] };
  expect(body.transitions.some((t) => t.trenchId === live.id && t.to === "live")).toBe(true);
  upcoming = await createTrenchViaApi(request, ADMIN, { name: `F3 upcoming ${tag}`, startInMs: 20 * 60_000, durationMs: 30 * 60_000, fund: true });
});

async function joinViaMock(page: import("@playwright/test").Page, slug: string) {
  await page.goto(`/t/${slug}`);
  await page.getByRole("button", { name: "Join this Trench" }).click();
  await page.getByRole("button", { name: "Verify as human" }).click({ timeout: 60_000 });
  await expect(page.getByText("You're in. Place your first order.")).toBeVisible({ timeout: 120_000 });
}

test("F3.3 guards: not entered, not live, asset not allowed, below minimum", async ({ page, request }) => {
  await demoSession(page, TRADER);
  await joinViaMock(page, live.slug);

  const q = (body: Record<string, unknown>, who = TRADER, id = live.id) => request.post(`/api/trenches/${id}/orders/quote`, { headers: demoHeaders(who), data: body });
  const base = { type: "market", asset: WETH, side: "buy", amount: "3", params: {}, preview: true };

  const outsider = await q(base, OUTSIDER);
  expect(outsider.status()).toBe(403);
  expect(((await outsider.json()) as { error: string }).error).toBe("Join the Trench before trading.");

  const notLive = await q(base, TRADER, upcoming.id);
  expect(notLive.status()).toBe(409);
  expect(((await notLive.json()) as { error: string }).error).toBe("This Trench isn't live.");

  const badAsset = await q({ ...base, asset: DEGEN });
  expect(badAsset.status()).toBe(400);
  expect(((await badAsset.json()) as { error: string }).error).toMatch(/isn't an allowed asset in this Trench\.$/);

  const tooSmall = await q({ ...base, amount: "0.5" });
  expect(tooSmall.status()).toBe(400);
  expect(((await tooSmall.json()) as { error: string }).error).toBe("Minimum order is 1 USDC.");
});

test("F3 quote: market and DCA quotes carry the platform fee; ticket shows the quote line", async ({ page, request }, testInfo) => {
  await demoSession(page, TRADER);
  const market = await request.post(`/api/trenches/${live.id}/orders/quote`, { headers: demoHeaders(TRADER), data: { type: "market", asset: WETH, side: "buy", amount: "3", params: {}, preview: true } });
  expect(market.status()).toBe(200);
  const m = (await market.json()) as { quoteId: string; feeUsd: string; priceUsd: number; to: { amount: string } };
  expect(Number(m.feeUsd)).toBeGreaterThan(0.005); // 30 bps of $3 = $0.009
  expect(m.priceUsd).toBeGreaterThan(100);
  expect(Number(m.to.amount)).toBeGreaterThan(0);

  const dca = await request.post(`/api/trenches/${live.id}/orders/quote`, { headers: demoHeaders(TRADER), data: { type: "dca", asset: WETH, side: "buy", amount: "3", params: { legs: 3, intervalSeconds: 60 }, preview: true } });
  expect(dca.status()).toBe(200);

  await page.goto(`/t/${live.slug}`);
  await expect(page.getByRole("heading", { name: "Place an order" })).toBeVisible();
  await expect(page.getByText(/≈ .* WETH at \$.* · fee .* USDC/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("radio", { name: "Bracket" })).toBeDisabled();
  await page.getByRole("radio", { name: "DCA" }).click();
  await expect(page.getByLabel("Legs")).toHaveValue("3");
  await expect(page.getByText(/≈ .* WETH at \$.* · fee .* USDC/)).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: testInfo.outputPath("ticket.png"), fullPage: true });
  await expect(page.getByText("No orders yet.")).toBeVisible();
});

test("F3.4 a rejected submission is stored as failed with the Flash message", async ({ page, request }) => {
  await demoSession(page, TRADER);
  const quote = await request.post(`/api/trenches/${live.id}/orders/quote`, { headers: demoHeaders(TRADER), data: { type: "market", asset: WETH, side: "buy", amount: "3", params: {} } });
  expect(quote.status()).toBe(200);
  const { quoteId } = (await quote.json()) as { quoteId: string };
  const submit = await request.post(`/api/trenches/${live.id}/orders`, { headers: demoHeaders(TRADER), data: { quoteId, userSignature: "0x" + "11".repeat(65) } });
  expect(submit.status()).toBe(400);
  const err = ((await submit.json()) as { error: string }).error;
  expect(err.length).toBeGreaterThan(5);

  const list = await request.get(`/api/trenches/${live.id}/orders`, { headers: demoHeaders(TRADER) });
  const body = (await list.json()) as { orders: { order: { status: string; error?: string | null } }[] };
  expect(body.orders[0]?.order.status).toBe("failed");
  expect(body.orders[0]?.order.error).toBe(err);

  await page.goto(`/t/${live.slug}`);
  await expect(page.getByText("Failed", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(err)).toBeVisible();
});
