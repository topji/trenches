import { expect, test } from "@playwright/test";
import { createTrenchViaApi, demoHeaders, demoSession, type CreatedTrench } from "./helpers";

/**
 * F2 Join a Trench (ACCEPTANCE_TESTS.md F2.1–F2.5) in WORLD_MOCK mode: the in-page mock sheet stands in
 * for the IDKit widget; the server still verifies nonce, action, environment, signal and uniqueness.
 */
const ADMIN = "0xE5B3DB4a3D4F88C21CF85492222c8B4dDcdc1e87";
const TRADER_A = "0x1111111111111111111111111111111111111111";
const TRADER_B = "0x2222222222222222222222222222222222222222";
const TRADER_C = "0x3333333333333333333333333333333333333333";

let open: CreatedTrench; // funded, joinable
let draft: CreatedTrench; // not funded
let ended: CreatedTrench; // funded but past endAt

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  test.setTimeout(240_000);
  const tag = Date.now().toString(36);
  open = await createTrenchViaApi(request, ADMIN, { name: `F2 open ${tag}`, startInMs: 15 * 60_000, durationMs: 30 * 60_000, fund: true });
  draft = await createTrenchViaApi(request, ADMIN, { name: `F2 draft ${tag}`, startInMs: 15 * 60_000, durationMs: 30 * 60_000, fund: false });
  ended = await createTrenchViaApi(request, ADMIN, { name: `F2 ended ${tag}`, startInMs: -10 * 60_000, durationMs: 5 * 60_000, fund: true });
});

test("F2.1 success: verified human appears on the board at $0.00 with the badge", async ({ page, request }, testInfo) => {
  await demoSession(page, TRADER_A);
  await page.goto(`/t/${open.slug}`);
  await page.getByRole("button", { name: "Join this Trench" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: testInfo.outputPath("mock-sheet.png"), fullPage: true });
  await page.getByRole("button", { name: "Verify as human" }).click();
  await expect(page.getByText("You're in. Place your first order.")).toBeVisible({ timeout: 120_000 });

  const row = page.getByRole("row").filter({ hasText: "0x1111…1111" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("$0.00");
  await expect(row.getByLabel("Verified unique human (World ID)")).toBeVisible();
  await expect(row.getByText("You")).toBeVisible();
  await expect(page.getByText("1 entrant")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("joined.png"), fullPage: true });

  const api = await request.get(`/api/trenches/${open.id}`);
  const body = (await api.json()) as { hcs: { event: string }[] };
  expect(body.hcs.map((m) => m.event)).toContain("entry.joined");
});

test("F2.2 cancel: closing the mock widget sends nothing and keeps the Join button", async ({ page }) => {
  await demoSession(page, TRADER_B);
  let joinPosts = 0;
  await page.route("**/api/trenches/*/join", (route) => {
    joinPosts += 1;
    void route.continue();
  });
  await page.goto(`/t/${open.slug}`);
  await page.getByRole("button", { name: "Join this Trench" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Verification cancelled. Join when you're ready.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Join this Trench" })).toBeEnabled();
  expect(joinPosts).toBe(0);
});

test("F2.3 invalid proof: server answers 401 and the UI says so", async ({ page, request }) => {
  await demoSession(page, TRADER_B);
  await page.route("**/api/trenches/*/join", (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as { result: { responses: { signal_hash: string }[] } };
    body.result.responses[0]!.signal_hash = "0x00"; // proof issued for a different signal
    void route.continue({ postData: JSON.stringify(body) });
  });
  await page.goto(`/t/${open.slug}`);
  await page.getByRole("button", { name: "Join this Trench" }).click();
  await page.getByRole("button", { name: "Verify as human" }).click({ timeout: 60_000 });
  await expect(page.getByText("Verification failed. Try again.")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Join this Trench" })).toBeEnabled();

  const direct = await request.post(`/api/trenches/${open.id}/join`, { headers: demoHeaders(TRADER_B), data: { result: { nope: true } } });
  expect(direct.status()).toBe(401);
  const unsolicited = await request.post(`/api/trenches/${open.id}/join`, {
    headers: demoHeaders(TRADER_B),
    data: { result: { protocol_version: "4.0", nonce: "not-ours", action: "join-trench", environment: "staging", responses: [{ identifier: "proof_of_human", proof: [], nullifier: "0x1", issuer_schema_id: 1, expires_at_min: 1 }] } },
  });
  expect(unsolicited.status()).toBe(401);
});

test("F2.4 duplicate: the same human (nullifier) cannot enter twice", async ({ page, request }) => {
  await demoSession(page, TRADER_C);
  await page.goto(`/t/${open.slug}`);
  await page.getByRole("button", { name: "Join this Trench" }).click();
  await page.getByLabel("Mock identity").fill(TRADER_A, { timeout: 60_000 }); // same mock human as F2.1, different wallet
  await page.getByRole("button", { name: "Verify as human" }).click();
  await expect(page.getByText("You've already entered this Trench.")).toBeVisible({ timeout: 60_000 });

  const again = await request.post(`/api/trenches/${open.id}/join`, { headers: demoHeaders(TRADER_A), data: { result: {} } });
  expect(again.status()).toBe(409);
});

test("F2.5 join is disabled with the reason on draft and ended Trenches", async ({ page }) => {
  await demoSession(page, TRADER_B);
  await page.goto(`/t/${draft.slug}`);
  await expect(page.getByRole("button", { name: "Join this Trench" })).toBeDisabled();
  await expect(page.getByText("This Trench hasn't been funded yet.")).toBeVisible();
  await page.goto(`/t/${ended.slug}`);
  await expect(page.getByRole("button", { name: "Join this Trench" })).toBeDisabled();
  await expect(page.getByText("This Trench has ended.")).toBeVisible();
});
