import { expect, test } from "@playwright/test";
import { createTrenchViaApi, demoHeaders, demoSession, joinViaApi, waitForStatus } from "./helpers";

/**
 * Clans: create clan → second trader joins → leader creates a clan season → non-member blocked →
 * members join → fast-forward → ladder shows the clan with a score. Mocked World proofs, real Arkiv / Hedera.
 */
// Fresh wallets per run: a wallet can be in one Trench at a time, so reusing fixtures would answer 409.
const RUN = Date.now().toString(16).padStart(12, "0").slice(-12);
const LEADER = `0xb${"b".repeat(27)}${RUN}`;
const MEMBER = `0xc${"c".repeat(27)}${RUN}`;
const OUTSIDER = `0xd${"d".repeat(27)}${RUN}`;
const ADMIN = "0xE5B3DB4a3D4F88C21CF85492222c8B4dDcdc1e87";

let tag = "";
let clanId = "";
let seasonId = "";
let seasonSlug = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  test.setTimeout(480_000);
  // Both traders must be verified humans first: join any Trench through the mocked World flow.
  const warm = await createTrenchViaApi(request, ADMIN, { name: `Clan warm-up ${Date.now().toString(36)}`, startInMs: 20 * 60_000, durationMs: 30 * 60_000, fund: true });
  await joinViaApi(request, warm.id, LEADER);
  await joinViaApi(request, warm.id, MEMBER);
  tag = `C${Date.now().toString(36).slice(-4).toUpperCase()}`.slice(0, 5);
});

test("create a clan, claim a handle, second trader joins, ladder lists it", async ({ page, request }, testInfo) => {
  test.slow();
  await demoSession(page, LEADER);
  await page.goto("/create-trench");
  await page.getByLabel("Trench name").fill(`Night Shift ${tag}`);
  await page.getByLabel("Tag (3–5 letters)").fill(tag);
  await page.getByLabel("Description").fill("e2e clan");
  await page.getByRole("button", { name: "Create Trench" }).click();
  await page.waitForURL(new RegExp(`/trench/${tag}$`), { timeout: 120_000 });
  await expect(page.getByRole("heading", { level: 1, name: `Night Shift ${tag}` })).toBeVisible();
  await expect(page.getByText("You're in this Trench.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Create internal season" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("clan-page.png"), fullPage: true });

  const me = await request.get("/api/me/clan", { headers: demoHeaders(LEADER) });
  clanId = ((await me.json()) as { clan: { id: string } }).clan.id;

  // handle: one per human, set once
  const h = await request.post("/api/profile/handle", { headers: demoHeaders(LEADER), data: { handle: `lead_${tag.toLowerCase()}` } });
  expect(h.status()).toBe(200);
  const dup = await request.post("/api/profile/handle", { headers: demoHeaders(MEMBER), data: { handle: `lead_${tag.toLowerCase()}` } });
  expect(dup.status()).toBe(409);
  expect(((await dup.json()) as { error: string }).error).toBe("Handle taken.");

  // second trader joins (open clan)
  const j = await request.post(`/api/clans/${clanId}/join`, { headers: demoHeaders(MEMBER), data: {} });
  expect(j.status()).toBe(201);
  const again = await request.post(`/api/clans/${clanId}/join`, { headers: demoHeaders(MEMBER), data: {} });
  expect(again.status()).toBe(409);
  expect(((await again.json()) as { error: string }).error).toBe(`You're already in [${tag}].`);

  await page.goto("/trenches");
  await expect(page.getByRole("link", { name: new RegExp(`\\[${tag}\\] Night Shift`) })).toBeVisible({ timeout: 90_000 });
});

test("leader creates a clan season; a non-member cannot join; members can", async ({ request }) => {
  test.slow();
  const now = Date.now();
  const res = await request.post("/api/trenches", {
    headers: demoHeaders(LEADER),
    data: {
      name: `Clan season ${tag}`,
      description: "members only",
      startAt: new Date(now - 60_000).toISOString(),
      endAt: new Date(now + 30 * 60_000).toISOString(),
      allowedAssets: [{ chainId: 8453, address: "0x4200000000000000000000000000000000000006", symbol: "WETH" }],
      prizePoolUsdc: 1,
      prizeSplit: [50, 30, 20],
      entryRule: "open",
      adminFeeShareBps: 5000,
      clanId,
    },
  });
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { trench: { id: string; slug: string; clanId?: string } };
  expect(body.trench.clanId).toBe(clanId);
  seasonId = body.trench.id;
  seasonSlug = body.trench.slug;

  // an outsider (even verified) cannot create a season for this clan
  const forbidden = await request.post("/api/trenches", { headers: demoHeaders(OUTSIDER), data: { name: "Outsider season", startAt: new Date(now + 60_000).toISOString(), endAt: new Date(now + 30 * 60_000).toISOString(), allowedAssets: [{ chainId: 8453, address: "0x4200000000000000000000000000000000000006", symbol: "WETH" }], prizePoolUsdc: 1, prizeSplit: [100], entryRule: "open", adminFeeShareBps: 5000, clanId } });
  expect(forbidden.status()).toBe(403);

  const fund = await request.post(`/api/trenches/${seasonId}/fund`, { headers: demoHeaders(LEADER), data: {} });
  expect(fund.ok()).toBe(true);
  await waitForStatus(request, seasonId, "live");

  await expect(joinViaApi(request, seasonId, OUTSIDER)).rejects.toThrow(/403/);
  await joinViaApi(request, seasonId, LEADER);
  await joinViaApi(request, seasonId, MEMBER);
});

test("clan season page shows [TAG] handle · title; fast-forward settles and the ladder moves", async ({ page, request }, testInfo) => {
  test.slow();
  await page.goto(`/t/${seasonSlug}`);
  await expect(page.getByRole("link", { name: `internal season [${tag}]` })).toBeVisible();
  const leaderRow = page.getByRole("row").filter({ hasText: `[${tag}] lead_${tag.toLowerCase()}` });
  await expect(leaderRow).toBeVisible({ timeout: 60_000 });
  await expect(leaderRow).toContainText("Recruit");
  await page.screenshot({ path: testInfo.outputPath("clan-season-board.png"), fullPage: true });

  const ff = await request.post("/api/dev/fast-forward", { headers: demoHeaders(ADMIN), data: { trenchId: seasonId } });
  expect(ff.ok()).toBe(true);
  await waitForStatus(request, seasonId, "settled");
  await request.post("/api/dev/tick", { data: { clans: true } });

  await expect
    .poll(
      async () => {
        const r = await request.get("/api/clans/ladder");
        const b = (await r.json()) as { rows: { tag: string; podiums: number; score: number }[] };
        return b.rows.find((x) => x.tag === tag)?.podiums ?? -1;
      },
      { timeout: 90_000 },
    )
    .toBeGreaterThanOrEqual(2); // leader + member finished 1st and 2nd → two podiums → +40 score
  await page.goto("/trenches");
  const row = page.getByRole("row").filter({ hasText: `[${tag}]` });
  await expect(row).toContainText(/\d+\.\d/);
  await page.screenshot({ path: testInfo.outputPath("ladder.png"), fullPage: true });
  await page.goto(`/u/${LEADER}`);
  await expect(page.getByText(/Level \d · \w+/)).toBeVisible();
  await expect(page.getByText(`[${tag}] lead_${tag.toLowerCase()}`).first()).toBeVisible();
});
