import { expect, test, type Page } from "@playwright/test";
import { demoSession, waitForStatus } from "./helpers";

/**
 * F1 Create a battle (ACCEPTANCE_TESTS.md §1 F1.1–F1.4). Hits real testnets (Hedera, Arkiv) and Neon.
 * F1.4 uses /api/dev/tick with a pretend clock instead of waiting for the worker's 30 s cron.
 */
const ADMIN = "0xE5B3DB4a3D4F88C21CF85492222c8B4dDcdc1e87";

function localInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function fillBasics(page: Page, name: string) {
  await demoSession(page, ADMIN);
  await page.goto("/create");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Prize pool (USDC)").fill("1.5");
}

test("F1.2 invalid forms show field-level errors and send nothing", async ({ page }) => {
  let posted = 0;
  await page.route("**/api/trenches", (route) => {
    posted += 1;
    void route.abort();
  });
  await fillBasics(page, "Bad Trench");
  const start = new Date(Date.now() + 10 * 60_000);
  await page.getByLabel("Starts").fill(localInput(start));
  await page.getByLabel("Ends").fill(localInput(new Date(start.getTime() - 60_000)));
  await page.getByRole("button", { name: "Create battle" }).click();
  await expect(page.getByText("End time must be after start time.")).toBeVisible();

  await page.getByLabel("Ends").fill(localInput(new Date(start.getTime() + 30 * 60_000)));
  await page.getByLabel("Rank 3 share").fill("10");
  await page.getByRole("button", { name: "Create battle" }).click();
  await expect(page.getByText("Prize split adds up to 90%, needs 100%.")).toBeVisible();

  await page.getByLabel("Rank 3 share").fill("20");
  await page.getByRole("button", { name: "WETH", pressed: true }).click(); // deselect the only asset
  await page.getByRole("button", { name: "Create battle" }).click();
  await expect(page.getByText("Add at least one asset.")).toBeVisible();
  expect(posted).toBe(0);
});

test("F1.1 + F1.3 + F1.4 create, fund, go live", async ({ page }, testInfo) => {
  test.slow();
  const name = `E2E Trench ${Date.now().toString(36)}`;
  await fillBasics(page, name);
  // datetime-local has minute precision: start on the next whole minute at least 90 s away
  const start = new Date(Math.ceil((Date.now() + 90_000) / 60_000) * 60_000);
  await page.getByLabel("Starts").fill(localInput(start));
  await page.getByLabel("Ends").fill(localInput(new Date(start.getTime() + 20 * 60_000))); // > 10 min so the pill reads Live, not Ending soon
  await page.screenshot({ path: testInfo.outputPath("create-form.png"), fullPage: true });
  await page.getByRole("button", { name: "Create battle" }).click();

  // F1.1: draft exists; escrow + topic ids with HashScan links on the funding screen
  await page.waitForURL(/\/create\/[0-9A-Z]+\/fund/, { timeout: 120_000 });
  await expect(page.getByRole("heading", { name: "Fund the prize pool" })).toBeVisible();
  await expect(page.getByText("Battle created")).toBeVisible();
  await expect(page.getByText(/^0\.0\.\d+$/).first()).toBeVisible();
  const hashscanLinks = page.getByRole("link", { name: /HashScan/ });
  await expect(hashscanLinks).toHaveCount(2);
  await expect(page.getByRole("link", { name: /Arkiv/ })).toHaveAttribute("href", /rabdi\.explorer\.arkiv\.network\/entity\/0x/);
  await page.screenshot({ path: testInfo.outputPath("funding.png"), fullPage: true });
  const trenchId = page.url().match(/\/create\/([0-9A-Z]+)\/fund/)![1]!;

  // F1.3: fund → funded, fundingTxId, trench.funded on HCS
  await page.getByRole("button", { name: "Fund escrow" }).click();
  await expect(page.getByText(/Your battle is live at/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole("link", { name: /Funding tx/ })).toHaveAttribute("href", /hashscan\.io\/testnet\/transaction\//);
  await page.screenshot({ path: testInfo.outputPath("funded.png"), fullPage: true });

  const api = await page.request.get(`/api/trenches/${trenchId}`);
  const body = (await api.json()) as { trench: { status: string; slug: string; hedera: { fundingTxId?: string } }; hcs: { event: string }[]; source: string };
  expect(body.trench.status).toBe("funded");
  expect(body.trench.hedera.fundingTxId).toBeTruthy();
  expect(body.hcs.map((m) => m.event)).toEqual(expect.arrayContaining(["trench.created", "trench.funded"]));
  expect(body.source).toBe("arkiv");

  // Discovery shows it (funded)
  await page.goto("/battles?status=upcoming");
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();

  // Trench page renders from Arkiv
  await page.getByRole("link", { name: "Open the battle" }).isVisible().catch(() => {});
  await page.goto(`/t/${body.trench.slug}`);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByText("Upcoming")).toBeVisible();
  await expect(page.getByRole("link", { name: /View on HashScan/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Results log/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Public record on Arkiv/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("trench-upcoming.png"), fullPage: true });

  // F1.4: once startAt passes, one worker tick flips funded → live (the cron does this every 30 s)
  await page.waitForTimeout(Math.max(0, start.getTime() + 1000 - Date.now()));
  // The worker (every 30 s) may claim the transition first; either way the Trench must now be live.
  await page.request.post("/api/dev/tick", { data: { trenchId } });
  await waitForStatus(page.request, trenchId, "live");
  await page.reload();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await expect(page.getByText("left", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("trench-live.png"), fullPage: true });
});
