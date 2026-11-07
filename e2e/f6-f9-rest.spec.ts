import { expect, test } from "@playwright/test";
import { createTrenchViaApi, demoHeaders, demoSession, joinViaApi, waitForStatus, type CreatedTrench } from "./helpers";

/** F6 dashboard, F7 profile, F8 discovery, F9 sponsor. Real Arkiv / Hedera writes behind each. */
const ADMIN = "0xE5B3DB4a3D4F88C21CF85492222c8B4dDcdc1e87";
const HOST = "0x8888888888888888888888888888888888888888";
const SPONSOR = "0xAaaaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
const TRADER = "0xd3ad26714e5ef9583d9b441146e14a8e3913d00c"; // the builder's wallet: real results in the settled gate Trench
const NOBODY = "0x0000000000000000000000000000000000000001";

let funded: CreatedTrench;
let draft: CreatedTrench;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  test.setTimeout(480_000);
  const tag = Date.now().toString(36);
  funded = await createTrenchViaApi(request, HOST, { name: `F6 funded ${tag}`, startInMs: 20 * 60_000, durationMs: 30 * 60_000, fund: true });
  draft = await createTrenchViaApi(request, HOST, { name: `F9 draft ${tag}`, startInMs: 20 * 60_000, durationMs: 30 * 60_000, fund: false });
  await joinViaApi(request, funded.id, TRADER);
});

test("F8 discovery: funded + live from Arkiv, chips by status and asset, drafts hidden, ended behind its chip", async ({ page, request }) => {
  await waitForStatus(request, funded.id, "funded");
  await page.goto("/trenches");
  await expect(page.getByRole("heading", { name: "Live and upcoming Trenches" })).toBeVisible();
  const row = page.getByRole("link", { name: new RegExp(funded.slug.split("-")[0]!, "i") }).filter({ hasText: "F6 funded" });
  await expect(row.first()).toBeVisible();
  await expect(row.first()).toContainText(/1 entrant/);
  await expect(row.first()).toContainText(/starts in/);
  await expect(page.getByText("F9 draft")).toHaveCount(0); // F8.2 drafts never listed
  await page.getByRole("link", { name: "Upcoming" }).click();
  await expect(page.getByText("F6 funded")).toBeVisible();
  await page.getByRole("link", { name: "Live" }).click();
  await expect(page.getByText("F6 funded")).toHaveCount(0);
  await page.getByRole("link", { name: "Ended" }).click();
  await expect(page.getByText("Flash gate Trench")).toBeVisible(); // settled, only under Ended
  await page.getByRole("link", { name: "All" }).click();
  await page.getByRole("link", { name: "WETH", exact: true }).click();
  await expect(page.getByText("F6 funded")).toBeVisible();
  await expect(page).toHaveURL(/asset=WETH/);
});

test("F9.1 sponsor funds a draft Trench and proposes an asset; F9.2 host accepts", async ({ page, request }, testInfo) => {
  test.slow();
  await demoSession(page, SPONSOR);
  await page.goto(`/sponsor/${draft.slug}`);
  await expect(page.getByRole("heading", { name: /^Sponsor F9 draft/ })).toBeVisible();
  await page.getByLabel("Sponsor name").fill("Zolt Labs");
  await page.getByLabel("Logo (URL)").fill("https://example.com/logo.png");
  await page.getByLabel("Amount (USDC)").fill("2");
  await page.getByLabel("Propose asset (optional)").selectOption("cbBTC");
  await page.screenshot({ path: testInfo.outputPath("sponsor-form.png"), fullPage: true });
  await page.getByRole("button", { name: "Fund prize pool" }).click();
  await expect(page.getByText(/Prize pool is now 3\.00 USDC/)).toBeVisible({ timeout: 120_000 });

  await waitForStatus(request, draft.id, "funded");
  const api = (await (await request.get(`/api/trenches/${draft.id}`)).json()) as { trench: { prizePoolUsdc: number; sponsor?: { name: string }; allowedAssets: { symbol: string }[] }; hcs: { event: string }[] };
  expect(api.trench.prizePoolUsdc).toBe(3);
  expect(api.trench.sponsor?.name).toBe("Zolt Labs");
  expect(api.trench.allowedAssets.map((a) => a.symbol)).toEqual(["WETH"]); // original stands until accepted
  expect(api.hcs.map((m) => m.event)).toEqual(expect.arrayContaining(["trench.sponsored", "trench.funded"]));

  await page.goto(`/t/${draft.slug}`);
  await expect(page.getByText("Prize pool by Zolt Labs")).toBeVisible();
  const og = await request.get(`/t/${draft.slug}/opengraph-image`);
  expect(og.ok()).toBe(true);
  expect(og.headers()["content-type"]).toContain("image/png");

  // F9.2: the host sees the pending change on the dashboard and accepts it
  const hostPage = await page.context().newPage();
  await demoSession(hostPage, HOST);
  await hostPage.goto("/dashboard");
  await expect(hostPage.getByText(/proposed cbBTC as the allowed asset/)).toBeVisible({ timeout: 60_000 });
  await hostPage.getByRole("button", { name: "Accept" }).click();
  await expect(hostPage.getByText("Asset accepted")).toBeVisible();
  await expect.poll(async () => ((await (await request.get(`/api/trenches/${draft.id}`)).json()) as { trench: { allowedAssets: { symbol: string }[] } }).trench.allowedAssets.map((a) => a.symbol), { timeout: 60_000 }).toEqual(["cbBTC"]);
  await hostPage.close();
});

test("F6 dashboard: both Trenches with status, entrants, volume, fees, links; Share opens the X composer", async ({ page, context }, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
  await demoSession(page, HOST);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Your Trenches" })).toBeVisible();
  const r1 = page.getByRole("row").filter({ hasText: "F6 funded" });
  const r2 = page.getByRole("row").filter({ hasText: "F9 draft" });
  await expect(r1).toBeVisible({ timeout: 60_000 });
  await expect(r2).toBeVisible();
  await expect(r1).toContainText("Upcoming");
  await expect(r1.getByRole("cell").nth(2)).toHaveText("1"); // entrants
  await expect(r1.getByRole("link", { name: /Results log/ })).toHaveAttribute("href", /hashscan\.io\/testnet\/topic\//);
  await page.screenshot({ path: testInfo.outputPath("dashboard.png"), fullPage: true });
  await r1.getByRole("button", { name: "Share" }).click();
  const x = page.getByRole("link", { name: "Post to X" });
  await expect(x).toBeVisible();
  const href = await x.getAttribute("href");
  expect(href).toContain("https://x.com/intent/post?text=");
  expect(decodeURIComponent(href!)).toContain(`/t/${funded.slug}`);
  expect(decodeURIComponent(href!)).toContain("1 entrant");
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByText("Link copied")).toBeVisible();
});

test("F7 profile: real results from Arkiv with the human badge; empty state for a fresh address", async ({ page }, testInfo) => {
  await page.goto(`/u/${TRADER}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("0xd3ad…d00c");
  await expect(page.getByLabel("Verified unique human (World ID)").first()).toBeVisible();
  await expect(page.getByText("Trenches joined")).toBeVisible();
  await expect(page.getByText("Best finish")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Flash gate Trench" })).toContainText("#1");
  await page.screenshot({ path: testInfo.outputPath("profile.png"), fullPage: true });

  await page.goto(`/u/${NOBODY}`);
  await expect(page.getByText("No Trenches yet.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse Trenches" })).toBeVisible();
});
