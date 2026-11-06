import type { APIRequestContext, Page } from "@playwright/test";

/** Demo session (DEMO_MODE only): the browser sends these headers; the server accepts them only with DEMO_SECRET. */
export const DEMO_SECRET = process.env.DEMO_SECRET ?? "";
export const DEMO_STORAGE_KEY = "trenches.demo";

export async function demoSession(page: Page, address: string): Promise<void> {
  await page.addInitScript(
    ([key, addr, secret]) => {
      window.localStorage.setItem(key, JSON.stringify({ address: addr, secret }));
    },
    [DEMO_STORAGE_KEY, address, DEMO_SECRET] as const,
  );
}

export function demoHeaders(address: string): Record<string, string> {
  return { "x-trenches-demo": DEMO_SECRET, "x-trenches-address": address, "content-type": "application/json" };
}

export interface CreatedTrench {
  id: string;
  slug: string;
  status: string;
}

/** Create (and optionally fund) a Trench through the API. ~20 s each: Hedera account + topic + Arkiv + HCS. */
export async function createTrenchViaApi(
  request: APIRequestContext,
  admin: string,
  opts: { name: string; startInMs: number; durationMs: number; fund: boolean },
): Promise<CreatedTrench> {
  const now = Date.now();
  const res = await request.post("/api/trenches", {
    headers: demoHeaders(admin),
    data: {
      name: opts.name,
      description: "e2e",
      startAt: new Date(now + opts.startInMs).toISOString(),
      endAt: new Date(now + opts.startInMs + opts.durationMs).toISOString(),
      allowedAssets: [{ chainId: 8453, address: "0x4200000000000000000000000000000000000006", symbol: "WETH" }],
      prizePoolUsdc: 1,
      prizeSplit: [50, 30, 20],
      entryRule: "open",
      adminFeeShareBps: 5000,
    },
  });
  if (!res.ok()) throw new Error(`create failed: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as { trench: { id: string; slug: string; status: string } };
  let status = body.trench.status;
  if (opts.fund) {
    const f = await request.post(`/api/trenches/${body.trench.id}/fund`, { headers: demoHeaders(admin), data: {} });
    if (!f.ok()) throw new Error(`fund failed: ${f.status()} ${await f.text()}`);
    status = "funded";
  }
  return { id: body.trench.id, slug: body.trench.slug, status };
}

/** Poll the public Trench API until the Arkiv-backed status matches (Arkiv lags Postgres by a few seconds). */
export async function waitForStatus(request: APIRequestContext, id: string, status: string, timeoutMs = 90_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < until) {
    const res = await request.get(`/api/trenches/${id}`);
    if (res.ok()) {
      last = ((await res.json()) as { trench: { status: string } }).trench.status;
      if (last === status) return;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Trench ${id} is "${last}", expected "${status}" within ${timeoutMs} ms`);
}
